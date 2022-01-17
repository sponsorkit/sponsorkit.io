using System;
using System.Diagnostics;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using FluffySpoon.AspNet.NGrok;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Sponsorkit.Infrastructure.AspNet;

namespace Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

class SponsorkitStartupEntrypoint : IIntegrationTestEntrypoint
{
    private readonly IHost host;

    private readonly IServiceScope scope;

    public IServiceProvider RootProvider { get; }
    public IServiceProvider ScopeProvider => scope.ServiceProvider;

    private readonly CancellationTokenSource cancellationTokenSource;

    public SponsorkitStartupEntrypoint(SponsorkitEnvironmentSetupOptions options)
    {
        cancellationTokenSource = new CancellationTokenSource();

        host = Host.CreateDefaultBuilder()
            .ConfigureAppConfiguration(builder => TestConfigurationFactory.ConfigureBuilder(builder))
            .UseEnvironment(options.EnvironmentName ?? Microsoft.Extensions.Hosting.Environments.Development)
            .ConfigureWebHostDefaults(webBuilder => webBuilder
                .UseStartup<Startup>()
                .UseKestrel()
                .UseUrls("https://*:14569;http://*:14568")
                .UseNGrok(new NgrokOptions()
                {
                    ShowNGrokWindow = false,
                    Disable = false,
                    ApplicationHttpUrl = "http://localhost:14568"
                }))
            .ConfigureServices(services =>
            {
                TestServiceProviderFactory.ConfigureServicesForTesting(
                    services,
                    TestConfigurationFactory
                        .ConfigureBuilder(new ConfigurationBuilder())
                        .Build());
                options.IocConfiguration?.Invoke(services);
            })
            .Build();

        RootProvider = host.Services;

        var serviceScope = RootProvider.CreateScope();
        scope = serviceScope;
    }

    public async Task WaitUntilReadyAsync()
    {
        Console.WriteLine("Initializing integration test environment.");

        var hostStartTask = host.StartAsync(cancellationTokenSource.Token);
        await WaitForUrlToBeAvailable(hostStartTask, "http://localhost:14568/health");

        var ngrokService = RootProvider.GetService<INGrokHostedService>();
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
        while (!isAvailable && stopwatch.Elapsed < TimeSpan.FromSeconds(30))
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
        cancellationTokenSource.Cancel();

        scope.Dispose();
        host.Dispose();

        await Task.CompletedTask;
    }
}