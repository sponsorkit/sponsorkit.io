using System;
using MediatR;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using NSubstitute;
using Serilog;
using Sponsorkit.Infrastructure.GitHub;
using Sponsorkit.Infrastructure.Ioc;

namespace Sponsorkit.Tests.TestHelpers;

public class TestServiceProviderFactory
{
    public static IServiceProvider CreateUsingStartup(Action<IServiceCollection> configure = null)
    {
        var services = new ServiceCollection();

        var configuration = new ConfigurationBuilder()
            .AddJsonFile("appsettings.Development.json")
            .AddEnvironmentVariables()
            .Build();

        var environment = Substitute.For<IWebHostEnvironment>();
        environment.EnvironmentName.Returns("Development");
        services.AddSingleton(environment);

        ConfigureServicesForTesting(
            services,
            configuration,
            environment);

        configure?.Invoke(services);

        return services.BuildServiceProvider();
    }

    public static void ConfigureServicesForTesting(
        IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        var registry = new IocRegistry(
            services,
            configuration,
            environment);
        registry.ConfigureMediatr(typeof(TestServiceProviderFactory).Assembly);

        services.AddScoped<Mediator>();

        services.AddSingleton(Substitute.For<ILogger>());
        services.AddSingleton(Substitute.For<IGitHubClientFactory>());
    }
}