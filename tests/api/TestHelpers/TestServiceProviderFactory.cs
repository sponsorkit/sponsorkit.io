using System;
using MediatR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using NSubstitute;
using Serilog;
using Sponsorkit.Infrastructure.AspNet;
using Sponsorkit.Infrastructure.GitHub;
using Sponsorkit.Infrastructure.Ioc;

namespace Sponsorkit.Tests.TestHelpers
{
    public class TestServiceProviderFactory
    {
        public static IServiceProvider CreateUsingStartup(Action<IServiceCollection> configure = null)
        {
            var services = new ServiceCollection();

            var configuration = new ConfigurationBuilder()
                .AddJsonFile("appsettings.Development.json")
                .AddEnvironmentVariables()
                .Build();

            var environment = Substitute.For<IHostEnvironment>();
            environment.EnvironmentName.Returns("Development");
            services.AddSingleton(environment);

            var startup = new Startup(
                configuration,
                environment);
            startup.ConfigureServices(services);

            ConfigureServicesForTesting(
                services,
                configuration);

            configure?.Invoke(services);

            return services.BuildServiceProvider();
        }

        public static void ConfigureServicesForTesting(
            IServiceCollection services,
            IConfiguration configuration)
        {
            var registry = new IocRegistry(
                services,
                configuration);
            registry.ConfigureMediatr(typeof(TestServiceProviderFactory).Assembly);

            services.AddScoped<Mediator>();

            services.AddSingleton(Substitute.For<ILogger>());
            services.AddSingleton(Substitute.For<IGitHubClientFactory>());
        }
    }
}
