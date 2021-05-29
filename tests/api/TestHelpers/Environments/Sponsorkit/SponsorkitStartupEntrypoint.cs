using System;
using System.Diagnostics;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using FluffySpoon.AspNet.NGrok;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Sponsorkit.Infrastructure;

namespace Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit
{

    class SponsorkitStartupEntrypoint : IIntegrationTestEntrypoint
    {
        private readonly IHost host;

        private readonly IServiceScope scope;

        public IServiceProvider RootProvider { get; }
        public IServiceProvider ScopeProvider => this.scope.ServiceProvider;

        private readonly CancellationTokenSource cancellationTokenSource;

        public SponsorkitStartupEntrypoint(SponsorkitEnvironmentSetupOptions options)
        {
            this.cancellationTokenSource = new CancellationTokenSource();

            this.host = new HostBuilder()
                // .ConfigureWebHostDefaults(builder => builder
                //         .UseKestrel()
                //     //NGROK is currently disabled.
                //     // .UseNGrok(new NgrokOptions()
                //     // {
                //     //     ShowNGrokWindow = false,
                //     //     Disable = false,
                //     //     ApplicationHttpUrl = "http://localhost:14568"
                //     // })
                // )
                .UseEnvironment(
                    options.EnvironmentName ?? 
                    Microsoft.Extensions.Hosting.Environments.Development)
                .ConfigureHostConfiguration((builder) => Program
                    .ConfigureConfiguration(builder)
                    .Build())
                .ConfigureFunctionsWorkerDefaults(
                    (a, b) =>
                    {
                        
                    },
                    Program.ConfigureDefaults)
                .ConfigureServices((context, services) => Program
                    .ConfigureServices(services, context.Configuration))
                .Build();

            this.RootProvider = this.host.Services;

            var serviceScope = this.RootProvider.CreateScope();
            this.scope = serviceScope;
        }

        public async Task WaitUntilReadyAsync()
        {
            Console.WriteLine("Initializing integration test environment.");

            var hostStartTask = this.host.StartAsync(this.cancellationTokenSource.Token);
            await WaitForUrlToBeAvailable(hostStartTask, "http://localhost:7071/health");

            var ngrokService = this.RootProvider.GetService<INGrokHostedService>();
            if (ngrokService != null)
                await WaitForTunnelsToOpenAsync(ngrokService);

            await hostStartTask;
        }

        private static async Task WaitForTunnelsToOpenAsync(INGrokHostedService ngrokService)
        {
            var tunnels = await ngrokService.GetTunnelsAsync();
            Console.WriteLine("Tunnels {0} are now open.", tunnels.Select(x => x.PublicUrl));
        }

        private static async Task WaitForUrlToBeAvailable(Task hostStartTask, string url)
        {
            using var client = new HttpClient();

            var isAvailable = false;
            var stopwatch = Stopwatch.StartNew();
            while (!isAvailable && stopwatch.Elapsed < TimeSpan.FromSeconds(60))
            {
                isAvailable = true;

                if (hostStartTask.IsFaulted)
                    throw hostStartTask.Exception ?? new Exception("Unknown start task exception.");

                try
                {
                    var response = await client.GetAsync(url);
                    response.EnsureSuccessStatusCode();
                }
                catch (HttpRequestException)
                {
                    isAvailable = false;
                    await Task.Delay(1000);
                }
            }

            if (!isAvailable)
                throw new InvalidOperationException("The web server didn't start within enough time.");
        }

        public async ValueTask DisposeAsync()
        {
            this.cancellationTokenSource.Cancel();

            this.scope.Dispose();
            this.host.Dispose();
        }
    }

}
