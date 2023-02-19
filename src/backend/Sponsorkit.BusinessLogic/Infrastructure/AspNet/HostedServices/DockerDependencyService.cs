using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Net;
using Docker.DotNet;
using Docker.DotNet.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Stripe;

namespace Sponsorkit.BusinessLogic.Infrastructure.AspNet.HostedServices;

[ExcludeFromCodeCoverage]
public class DockerDependencyService : IDockerDependencyService, IHostedService
{
    private readonly IServiceProvider serviceProvider;

    private const string SqlPassword = "hNxX9Qz2";

    private DataContext? dataContext;
    private CustomerService? customerService;
    private PlanService? planService;

    private DockerClient? docker;

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


        using var dockerConfiguration = new DockerClientConfiguration();
        docker = dockerConfiguration.CreateClient();
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        using var scope = serviceProvider.CreateScope();

        dataContext = scope.ServiceProvider.GetRequiredService<DataContext>();
        customerService = scope.ServiceProvider.GetRequiredService<CustomerService>();
        planService = scope.ServiceProvider.GetRequiredService<PlanService>();
        
        await Task.WhenAll(
            StartDatabase(),
            CleanupStripeDataAsync());
    }

    private async Task StartDatabase()
    {
        await InitializeDockerAsync();
        await WaitForHealthyDockerDependenciesAsync();
        await PrepareDatabaseAsync();
    }

    private async Task CleanupStripeDataAsync()
    {
        await Task.WhenAll(
            CleanupStripeCustomersAsync(),
            CleanupStripePlansAsync());
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        docker?.Dispose();
        return Task.CompletedTask;
    }

    private async Task CleanupStripePlansAsync()
    {
        if (!ShouldDeleteExistingData())
            return;

        if (planService == null)
            throw new InvalidOperationException("Webhook endpoint service not initialized.");

        var planDeletionTasks = new List<Task>();
        await foreach (var plan in planService.ListAutoPagingAsync())
        {
            if (plan.Livemode)
                throw new InvalidOperationException("Found livemode plan.");

            planDeletionTasks.Add(DeleteStripePlanAsync(plan));
        }

        await Task.WhenAll(planDeletionTasks);
    }

    private async Task DeleteStripePlanAsync(Plan plan)
    {
        if (planService == null)
            throw new InvalidOperationException("Webhook endpoint service not initialized.");
        
        Console.WriteLine($"Deleting plan {plan.Id}");
        try
        {
            await planService.DeleteAsync(plan.Id);
        }
        catch (StripeException ex)
        {
            if (ex.HttpStatusCode != HttpStatusCode.NotFound)
                throw;
        }
    }

    private async Task CleanupStripeCustomersAsync()
    {
        if (!ShouldDeleteExistingData())
            return;

        if (customerService == null)
            throw new InvalidOperationException("Webhook endpoint service not initialized.");

        if (customerService.Client.ApiKey == null)
            return;

        var customerDeletionTasks = new List<Task>();
        
        await foreach (var customer in customerService.ListAutoPagingAsync())
        {
            if (customer.Livemode)
                throw new InvalidOperationException("Found livemode customer.");

            customerDeletionTasks.Add(DeleteStripeCustomerAsync(customer));
        }

        await Task.WhenAll(customerDeletionTasks);
    }

    private async Task DeleteStripeCustomerAsync(Customer customer)
    {
        if (customerService == null)
            throw new InvalidOperationException("Webhook endpoint service not initialized.");
        
        Console.WriteLine($"Deleting customer {customer.Id}");
        try
        {
            await customerService.DeleteAsync(customer.Id);
        }
        catch (StripeException ex)
        {
            if (ex.HttpStatusCode != HttpStatusCode.NotFound)
                throw;
        }
    }

    private async Task PrepareDatabaseAsync()
    {
        if (dataContext == null)
            throw new InvalidOperationException("Could not prepare database - data context was not initialized.");

        if (ShouldDeleteExistingData())
            await dataContext.Database.EnsureDeletedAsync();

        await dataContext.Database.MigrateAsync();
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
                await Task.Delay(100);
        }

        if (!isHealthy)
            throw new Exception("Timeout for Docker dependencies has elapsed.");

        Console.WriteLine("Docker dependencies are healthy.");
    }

    private static async Task<object?> ExecuteMasterDatabaseCommandAsync(string commandText)
    {
        await using var connection = new NpgsqlConnection(
            GetSqlConnectionStringForMasterDatabase());

        await connection.OpenAsync();

        var command = connection.CreateCommand();
        if (command == null)
            throw new InvalidOperationException("Command could not be created.");

        await using (command)
        {
            command.CommandText = commandText;

            return await command.ExecuteScalarAsync();
        }
    }

    private static async Task<bool> GetIsSqlServerHealthyAsync()
    {
        try
        {
            var result = (int?)await ExecuteMasterDatabaseCommandAsync("select 1");
            return result == 1;
        }
        catch (NpgsqlException)
        {
            return false;
        }
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
        var server = EnvironmentHelper.IsRunningInContainer ? AppendDockerContainerNameSuffix("postgres") : "localhost";

        var sqlServerPort = GetDockerSqlServerPort();
        var connectionString = $@"Server={server};Port={sqlServerPort};Database={database};User Id=postgres;Password={SqlPassword};";

        Console.WriteLine("Using connection string " + connectionString);

        return connectionString;
    }

    private async Task<IList<ContainerListResponse>> GetAllDockerContainersAsync()
    {
        if (docker == null)
            throw new InvalidOperationException("Docker not initialized.");

        try
        {
            return await docker.Containers.ListContainersAsync(new ContainersListParameters()
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
        return GetSqlConnectionStringForDatabase(string.Empty);
    }

    private async Task InitializeDockerAsync()
    {
        if (docker == null)
            throw new InvalidOperationException("Docker client not initialized.");

        var containers = await GetAllDockerContainersAsync();

        var containerConfigurations = new[]
        {
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
                await docker.Images.CreateImageAsync(
                    new ImagesCreateParameters
                    {
                        FromImage = imageNames[0],
                        Tag = imageNames[^1]
                    },
                    new AuthConfig(),
                    new Progress<JSONMessage>());

                var newContainer = await docker.Containers.CreateContainerAsync(containerConfiguration);
                containerId = newContainer.ID;
            }

            await docker.Containers.StartContainerAsync(
                containerId,
                new ContainerStartParameters());
        }
    }

    private static CreateContainerParameters GetSqlServerDockerConfig()
    {
        var hostname = AppendDockerContainerNameSuffix("postgres");
        return new CreateContainerParameters()
        {
            HostConfig = new HostConfig()
            {
                PortBindings = new Dictionary<string, IList<PortBinding>>()
                {
                    {
                        "5432/tcp", new List<PortBinding>()
                        {
                            new()
                            {
                                HostPort = GetDockerSqlServerPort()
                            }
                        }
                    }
                }
            },
            Env = new List<string>()
            {
                $"POSTGRES_PASSWORD={SqlPassword}"
            },
            Image = "postgres:latest",
            Name = hostname,
            Hostname = hostname,
            Cmd = new List<string>()
            {
                "postgres",
                "-c",
                "log_statement=all"
            }
        };
    }

    public static void InjectInto(
        IServiceCollection services)
    {
        services.AddSingleton<DockerDependencyService>();
        services.AddSingleton<IDockerDependencyService>(p => p.GetRequiredService<DockerDependencyService>());

        services.AddHostedService(p => p.GetRequiredService<DockerDependencyService>());

        services.AddDbContextPool<DataContext>(optionsBuilder =>
        {
            optionsBuilder.UseNpgsql(GetSqlConnectionStringForDatabase("sponsorkit"));
        });
    }
}