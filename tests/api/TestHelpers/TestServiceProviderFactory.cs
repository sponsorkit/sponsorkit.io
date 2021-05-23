using System;
using MediatR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using NSubstitute;
using Serilog;
using Sponsorkit.Infrastructure;

namespace Sponsorkit.Tests.TestHelpers
{
    public static class TestServiceProviderFactory
    {
        public static IServiceProvider CreateUsingStartup(Action<IServiceCollection> configure = null)
        {
            var services = new ServiceCollection();

            var environment = Substitute.For<IHostEnvironment>();
            environment.EnvironmentName.Returns("Development");
            services.AddSingleton(environment);

            Program.ConfigureServices(services);
            ConfigureServicesForTesting(services);

            configure?.Invoke(services);

            return services.BuildServiceProvider();
        }

        public static void ConfigureServicesForTesting(
            IServiceCollection services)
        {
            services.AddScoped<Mediator>();
            services.AddSingleton(Substitute.For<ILogger>());
        }
    }
}
