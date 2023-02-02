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
        ConfigureMediatr(services, registry);

        services.AddSingleton(entrypoint);

        services.AddSingleton(Substitute.For<ILogger>());
        services.AddSingleton(Substitute.For<IGitHubClientFactory>());
        services.AddSingleton(Substitute.For<IAmazonSimpleEmailServiceV2>());
        services.AddSingleton(Substitute.For<IGitHubClient>());
    }

    private static void ConfigureMediatr(IServiceCollection services, IocRegistry registry)
    {
        registry.ConfigureMediatr(typeof(TestServiceProviderFactory).Assembly);

        services.RemoveAll(typeof(IMediator));

        VirtualMediator virtualMediator = null;
        services.AddTransient(p =>
            virtualMediator ??= Substitute.ForPartsOf<VirtualMediator>(p));

        services.AddTransient<IMediator>(p => p
            .GetRequiredService<VirtualMediator>());

        services.AddScoped<Mediator>();
    }
}