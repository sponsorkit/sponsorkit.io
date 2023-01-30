using Amazon.SimpleEmailV2;
using MediatR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using NSubstitute;
using Octokit;
using Serilog;
using Sponsorkit.Infrastructure.GitHub;
using Sponsorkit.Infrastructure.Ioc;
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
        var registry = new IocRegistry(
            services,
            configuration,
            environment);
        registry.ConfigureMediatr(typeof(TestServiceProviderFactory).Assembly);
        
        services.RemoveAll(typeof(Mediator));
        services.AddScoped(p => 
            Substitute.ForPartsOf<Mediator>(
                p.GetRequiredService<ServiceFactory>()));
        services.AddScoped(p => 
            Substitute.ForPartsOf<VirtualMediator>(
                p.GetRequiredService<Mediator>()));

        services.AddSingleton(entrypoint);

        services.AddSingleton(Substitute.For<ILogger>());
        services.AddSingleton(Substitute.For<IGitHubClientFactory>());
        services.AddSingleton(Substitute.For<IAmazonSimpleEmailServiceV2>());
        services.AddSingleton(Substitute.For<IGitHubClient>());
    }
}