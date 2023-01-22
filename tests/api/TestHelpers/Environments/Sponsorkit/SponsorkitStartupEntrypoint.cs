using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using FluffySpoon.Ngrok;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Sponsorkit.Infrastructure;

namespace Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

class SponsorkitStartupEntrypoint : IIntegrationTestEntrypoint
{
    private readonly WebApplication application;
    private readonly IServiceScope scope;

    public IServiceProvider RootProvider { get; }
    public IServiceProvider ScopeProvider => scope.ServiceProvider;

    private readonly CancellationTokenSource cancellationTokenSource;

    private readonly IList<Exception> backgroundEndpointExceptions;

    public SponsorkitStartupEntrypoint(SponsorkitEnvironmentSetupOptions options)
    {
        cancellationTokenSource = new CancellationTokenSource();
        backgroundEndpointExceptions = new List<Exception>();

        var builder = Startup.CreateWebApplicationBuilder(new WebApplicationOptions()
        {
            EnvironmentName = 
                options.EnvironmentName ?? 
                Microsoft.Extensions.Hosting.Environments.Development
        });
        builder.WebHost
            .UseUrls("https://*:14569;http://*:14568")
            .ConfigureServices((context, services) =>
            {
                var environment = context.HostingEnvironment;
                var configuration = TestConfigurationFactory
                    .ConfigureBuilder(new ConfigurationManager())
                    .Build();

                TestServiceProviderFactory.ConfigureServicesForTesting(
                    services,
                    configuration,
                    environment,
                    this);
                options.IocConfiguration?.Invoke(services);
            });
        
        var app = builder.Build();
        
        Startup.ConfigureWebApplication(app);
        
        application = app;

        RootProvider = app.Services;
        scope = app.Services.CreateScope();
    }

    public async Task WaitUntilReadyAsync()
    {
        Console.WriteLine("Initializing integration test environment.");

        var hostStartTask = application.StartAsync(cancellationTokenSource.Token);
        await WaitForUrlToBeAvailable(hostStartTask, "http://localhost:14568/health");

        var ngrokService = RootProvider.GetService<INgrokService>();
        if (ngrokService != null)
            await ngrokService.WaitUntilReadyAsync(cancellationTokenSource.Token);

        await hostStartTask;
        
        await DatabaseMigrator.MigrateDatabaseForHostAsync(application);
    }

    public async Task OnBackgroundEndpointErrorAsync(Exception exception)
    {
        backgroundEndpointExceptions.Add(exception);
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
        await application.StopAsync();
        
        cancellationTokenSource.Cancel();

        await application.DisposeAsync();

        if (backgroundEndpointExceptions.Count > 0)
            throw new AggregateException(backgroundEndpointExceptions);
    }
}