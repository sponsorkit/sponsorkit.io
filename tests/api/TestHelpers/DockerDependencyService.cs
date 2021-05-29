using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using Docker.DotNet;
using Docker.DotNet.Models;
using FluffySpoon.AspNet.NGrok;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Sponsorkit.Domain.Models;
using Sponsorkit.Infrastructure;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers
{
    [ExcludeFromCodeCoverage]
    public class DockerDependencyService
    {
        private readonly IServiceProvider serviceProvider;

        private const string SqlPassword = "hNxX9Qz2";

        private DataContext dataContext;
        private CustomerService customerService;
        private PlanService planService;
        private WebhookEndpointService webhookEndpointService;
        private INGrokHostedService ngrokHostedService;

        private DockerClient docker;

        public DockerDependencyService(
            IServiceProvider serviceProvider)
        {
            this.serviceProvider = serviceProvider;

            InitializeDocker();
        }

        private void InitializeDocker()
        {
            if (EnvironmentHelper.IsRunningInContainer)
                return;

            using var dockerConfiguration = new DockerClientConfiguration(new Uri("npipe://./pipe/docker_engine"));
            this.docker = dockerConfiguration.CreateClient();
        }

        public async Task StartAsync()
        {
            using var scope = this.serviceProvider.CreateScope();

            dataContext = scope.ServiceProvider.GetRequiredService<DataContext>();
            customerService = scope.ServiceProvider.GetRequiredService<CustomerService>();
            planService = scope.ServiceProvider.GetRequiredService<PlanService>();
            webhookEndpointService = scope.ServiceProvider.GetRequiredService<WebhookEndpointService>();

            ngrokHostedService = scope.ServiceProvider.GetService<INGrokHostedService>();

            if(this.ngrokHostedService != null)
                ngrokHostedService.Ready += SetupStripeWebhooksAsync;

            await InitializeDockerAsync();
            await WaitForHealthyDockerDependenciesAsync();
            await PrepareDatabaseAsync();
            await CleanupStripeDataAsync();
        }

        private async Task CleanupStripeDataAsync()
        {
            await Task.WhenAll(
                CleanupStripeCustomersAsync(),
                CleanupStripePlansAsync());
        }

        private async void SetupStripeWebhooksAsync(IEnumerable<FluffySpoon.AspNet.NGrok.NGrokModels.Tunnel> tunnels)
        {
            if (this.webhookEndpointService == null)
                return;

            if (this.ngrokHostedService == null)
                throw new InvalidOperationException("NGrok service has not been initialized yet.");

            await CleanupStripeWebhooksAsync();

            var sslTunnels = tunnels.Where(x => x.PublicUrl.StartsWith("https://", StringComparison.InvariantCulture));
            foreach (var tunnel in sslTunnels)
            {
                var webhookUrl = $"{tunnel.PublicUrl}/stripe";
                Console.WriteLine($"Created Stripe webhook towards {webhookUrl}");

                await this.webhookEndpointService.CreateAsync(new WebhookEndpointCreateOptions()
                {
                    Url = webhookUrl,
                    EnabledEvents = new List<string>() { "*" }
                });
            }
        }

        public async Task StopAsync()
        {
            this.docker?.Dispose();
            await CleanupStripeWebhooksAsync();
        }

        private async Task CleanupStripeWebhooksAsync()
        {
            if (this.webhookEndpointService == null)
                return;

            var existingEndpoints = await this.webhookEndpointService
                .ListAutoPagingAsync()
                .ToListAsync();
            foreach (var endpoint in existingEndpoints)
            {
                try
                {
                    await this.webhookEndpointService.DeleteAsync(endpoint.Id);
                }
                catch (StripeException)
                {
                    Console.WriteLine("A webhook was no longer found while trying to remove it.");
                }
            }
        }

        private async Task CleanupStripePlansAsync()
        {
            if (this.planService == null)
                return;

            if (!ShouldDeleteExistingData())
                return;

            var plansToDelete = await this.planService
                .ListAutoPagingAsync()
                .ToListAsync();
            foreach (var plan in plansToDelete)
            {
                if (plan.Livemode)
                    throw new InvalidOperationException("Found livemode plan.");

                Console.WriteLine($"Deleting customer {plan.Id}");
                try
                {
                    await this.planService.DeleteAsync(plan.Id);
                }
                catch (StripeException ex)
                {
                    if (ex.HttpStatusCode != HttpStatusCode.NotFound)
                        throw;
                }
            }
        }

        private async Task CleanupStripeCustomersAsync()
        {
            if (this.customerService == null)
                return;

            if (!ShouldDeleteExistingData())
                return;

            var customersToDelete = await this.customerService
                .ListAutoPagingAsync()
                .ToListAsync();
            foreach (var customer in customersToDelete)
            {
                if (DateTime.Now - customer.Created < TimeSpan.FromHours(1))
                    continue;

                if (customer.Livemode)
                    throw new InvalidOperationException("Found livemode customer.");

                Console.WriteLine($"Deleting customer {customer.Id}");
                try
                {
                    await this.customerService.DeleteAsync(customer.Id);
                }
                catch (StripeException ex)
                {
                    if (ex.HttpStatusCode != HttpStatusCode.NotFound)
                        throw;
                }
            }
        }

        private async Task PrepareDatabaseAsync()
        {
            if (this.dataContext == null)
                throw new InvalidOperationException("Could not prepare database - data context was not initialized.");

            if (ShouldDeleteExistingData())
                await this.dataContext.Database.EnsureDeletedAsync();

            await this.dataContext.Database.MigrateAsync();
        }

        private static bool ShouldDeleteExistingData()
        {
            if (EnvironmentHelper.IsRunningInTest)
                return true;

            if (EnvironmentHelper.IsRunningInContainer)
                return false;

            return false;
        }

        private static async Task WaitForHealthyDockerDependenciesAsync()
        {
            var stopwatch = Stopwatch.StartNew();

            var isHealthy = false;
            while (!isHealthy && stopwatch.Elapsed < TimeSpan.FromSeconds(60))
            {
                isHealthy = await GetIsSqlServerHealthyAsync();
                if (!isHealthy)
                    await Task.Delay(1000);
            }

            if (!isHealthy)
                throw new Exception("Timeout for Docker dependencies has elapsed.");

            Console.WriteLine("Docker dependencies are healthy.");
        }

        private static async Task<object> ExecuteMasterDatabaseCommandAsync(string commandText)
        {
            await using var connection = new SqlConnection(
                GetSqlConnectionStringForMasterDatabase());

            await connection.OpenAsync();

            await using var command = connection.CreateCommand();
            command.CommandText = commandText;

            return await command.ExecuteScalarAsync();
        }

        private static async Task<bool> GetIsSqlServerHealthyAsync()
        {
            try
            {
                var result = (int?)await ExecuteMasterDatabaseCommandAsync("select 1");
                if (result == 1)
                    return true;
            }
            catch (SqlException ex)
            {
                Console.WriteLine("SQL is still unhealthy: " + ex.Message);
                //ignored.
            }

            return false;
        }

        private static string AppendDockerContainerNameSuffix(string containerName)
        {
            return containerName +
                (EnvironmentHelper.IsRunningInTest ? "-test" : "") +
                (EnvironmentHelper.IsRunningInContainer ? "-container" : "");
        }

        private static string GetDockerSqlServerPort()
        {
            var port = 1433;

            if (!EnvironmentHelper.IsRunningInContainer)
                port += 1;

            if (!EnvironmentHelper.IsRunningInTest)
                port += 2;

            return port.ToString(CultureInfo.InvariantCulture);
        }

        private static string GetSqlConnectionStringForDatabase(string database)
        {
            var server = EnvironmentHelper.IsRunningInContainer ?
                AppendDockerContainerNameSuffix("mssql") :
                "localhost";

            var sqlServerPort = GetDockerSqlServerPort();
            var connectionString = $@"Server={server},{sqlServerPort};Database={database};User Id=SA;Password={SqlPassword}";

            Console.WriteLine("Using connection string " + connectionString);

            return connectionString;
        }

        private async Task<IList<ContainerListResponse>> GetAllDockerContainersAsync()
        {
            if (this.docker == null)
                return new List<ContainerListResponse>();

            try
            {
                return await this.docker.Containers.ListContainersAsync(new ContainersListParameters()
                {
                    All = true
                });
            }
            catch (TimeoutException ex)
            {
                throw new InvalidOperationException("It could seem as if Docker is not running.", ex);
            }
        }

        private static string GetSqlConnectionStringForMasterDatabase()
        {
            return GetSqlConnectionStringForDatabase("master");
        }

        private async Task InitializeDockerAsync()
        {
            if (this.docker == null)
                return;

            var containers = await GetAllDockerContainersAsync();

            var containerConfigurations = new[] {
                GetSqlServerDockerConfig()
            };

            foreach (var containerConfiguration in containerConfigurations)
            {
                var existingContainer = containers.SingleOrDefault(x => 
                    x.Names.Single() == "/" + containerConfiguration.Name);

                var containerId = existingContainer?.ID;

                if (existingContainer == null)
                {
                    var imageNames = containerConfiguration.Image.Split(":");
                    await this.docker.Images.CreateImageAsync(
                        new ImagesCreateParameters
                        {
                            FromImage = imageNames[0],
                            Tag = imageNames[^1]
                        },
                        new AuthConfig(),
                        new Progress<JSONMessage>());

                    var newContainer = await this.docker.Containers.CreateContainerAsync(containerConfiguration);
                    containerId = newContainer.ID;
                }

                await this.docker.Containers.StartContainerAsync(
                    containerId,
                    new ContainerStartParameters());
            }
        }

        private static CreateContainerParameters GetSqlServerDockerConfig()
        {
            var hostname = AppendDockerContainerNameSuffix("mssql");
            return new CreateContainerParameters()
            {
                HostConfig = new HostConfig()
                {
                    PortBindings = new Dictionary<string, IList<PortBinding>>()
                    {
                        {
                            "1433/tcp",
                            new List<PortBinding>()
                            {
                                new()
                                {
                                    HostPort = GetDockerSqlServerPort()
                                }
                            }
                        }
                    },
                    Tmpfs = EnvironmentHelper.IsRunningInTest ?
                        new Dictionary<string, string>()
                        {
                            { "/var/lib/mssql:rw,exec,suid,dev", "" }
                        } :
                        null
                },
                Env = new List<string>() { "ACCEPT_EULA=Y", $"SA_PASSWORD={SqlPassword}" },
                Image = "mcr.microsoft.com/mssql/server:2019-latest",
                Name = hostname,
                Hostname = hostname
            };
        }
    }
}
