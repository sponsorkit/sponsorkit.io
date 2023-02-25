using Amazon.SimpleEmailV2;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using NSubstitute;
using Serilog;
using Sponsorkit.Api.Infrastructure.Ioc;
using Sponsorkit.BusinessLogic.Infrastructure.Ioc;
using Sponsorkit.Tests.TestHelpers.Environments;

namespace Sponsorkit.Tests.TestHelpers;

public class TestServiceProviderFactory
{
    public static void ConfigureServicesForTesting(
        IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment,
        IIntegrationTestEntrypoint entrypoint)
    {
        var registry = new ApiIocRegistry(
            services,
            configuration,
            environment,
            new [] {
                typeof(ApiIocRegistry).Assembly,
                typeof(BusinessLogicIocRegistry).Assembly,
                typeof(TestServiceProviderFactory).Assembly
            });
        registry.Register();
        
        services.AddSingleton(entrypoint);

        services.AddSingleton(Substitute.For<ILogger>());
        services.AddSingleton(Substitute.For<IAmazonSimpleEmailServiceV2>());
    }
}