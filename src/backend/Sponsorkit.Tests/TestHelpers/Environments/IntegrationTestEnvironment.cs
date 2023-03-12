using System;
using System.Diagnostics.CodeAnalysis;
using System.Threading.Tasks;
using MediatR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Sponsorkit.BusinessLogic.Infrastructure;
using Sponsorkit.BusinessLogic.Infrastructure.Security.Encryption;
using Sponsorkit.Tests.BusinessLogic.Domain.Mediatr;
using Sponsorkit.Tests.TestHelpers.Environments.Contexts;

namespace Sponsorkit.Tests.TestHelpers.Environments;

public interface IIntegrationTestEnvironment
{
    public IServiceProvider ServiceProvider { get; }

    public IMediator Mediator { get; }
    IFakeMediatorInterceptor MediatorInterceptor { get; }
    
    public IEncryptionHelper EncryptionHelper  { get; }
    public DatabaseContext Database { get; }
    public GitHubContext GitHub { get; }
    public IConfiguration Configuration { get; }
    public StripeContext Stripe { get; }
}

public interface IEnvironmentSetupOptions
{
    public Action<IServiceCollection> IocConfiguration { get; set; }
}

[ExcludeFromCodeCoverage]
public abstract class IntegrationTestEnvironment<TOptions> : IAsyncDisposable, IIntegrationTestEnvironment
    where TOptions : IEnvironmentSetupOptions, new()
{
    private readonly IIntegrationTestEntrypoint entrypoint;

    public IServiceProvider ServiceProvider { get; }

    public IMediator Mediator => ServiceProvider.GetRequiredService<IMediator>();
    public IFakeMediatorInterceptor MediatorInterceptor => ServiceProvider.GetRequiredService<IFakeMediatorInterceptor>(); 

    public IEncryptionHelper EncryptionHelper => ServiceProvider.GetRequiredService<IEncryptionHelper>();
    public DatabaseContext Database => new (entrypoint, this);
    public GitHubContext GitHub => ServiceProvider.GetRequiredService<GitHubContext>();
    public IConfiguration Configuration => ServiceProvider.GetRequiredService<IConfiguration>();
    public StripeContext Stripe => ServiceProvider.GetRequiredService<StripeContext>();
    public EmailContext Email => ServiceProvider.GetRequiredService<EmailContext>();

    protected abstract IIntegrationTestEntrypoint GetEntrypoint(TOptions options);

    protected IntegrationTestEnvironment(TOptions options = default)
    {
        options ??= new TOptions();

        EnvironmentHelper.SetRunningInTestFlag();

        var oldIocConfiguration = options.IocConfiguration;
        options.IocConfiguration = services =>
        {
            services.AddSingleton<IIntegrationTestEnvironment>(this);

            services.AddTransient<StripeContext>();
            services.AddTransient<GitHubContext>();
            services.AddTransient<EmailContext>();
        
            RegisterMediatrInterception(services);
            
            oldIocConfiguration?.Invoke(services);
        };
        
        entrypoint = GetEntrypoint(options);
        ServiceProvider = entrypoint.ScopeProvider;
    }

    private static void RegisterMediatrInterception(IServiceCollection services)
    {
        services.AddScoped(
            typeof(IPipelineBehavior<,>),
            typeof(InterceptorBehavior<,>));

        services.AddSingleton(Substitute.For<IFakeMediatorInterceptor>());
    }

    protected virtual async Task InitializeAsync()
    {
        await entrypoint.WaitUntilReadyAsync();
    }

    public async ValueTask DisposeAsync()
    {
        await entrypoint.DisposeAsync();
    }
}