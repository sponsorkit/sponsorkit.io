using System;
using System.Diagnostics.CodeAnalysis;
using System.Threading.Tasks;
using MediatR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Sponsorkit.Infrastructure;
using Sponsorkit.Infrastructure.AspNet.HostedServices;
using Sponsorkit.Infrastructure.Security.Encryption;
using Sponsorkit.Tests.TestHelpers.Environments.Contexts;

namespace Sponsorkit.Tests.TestHelpers.Environments;

public interface IIntegrationTestEnvironment
{
    public IServiceProvider ServiceProvider { get; }

    public IMediator PartiallyFakeMediator { get; }
    public IEncryptionHelper EncryptionHelper  { get; }
    public DatabaseContext Database { get; }
    public GitHubContext GitHub { get; }
    public IConfiguration Configuration { get; }
    public StripeContext Stripe { get; }
}

[ExcludeFromCodeCoverage]
public abstract class IntegrationTestEnvironment<TOptions> : IAsyncDisposable, IIntegrationTestEnvironment
    where TOptions : class, new()
{
    private readonly IIntegrationTestEntrypoint entrypoint;

    public IServiceProvider ServiceProvider { get; }

    public IMediator PartiallyFakeMediator => ServiceProvider.GetRequiredService<Mediator>();
    public IEncryptionHelper EncryptionHelper => ServiceProvider.GetRequiredService<IEncryptionHelper>();
    public DatabaseContext Database => new (entrypoint, this);
    public GitHubContext GitHub => new (ServiceProvider);
    public IConfiguration Configuration => ServiceProvider.GetRequiredService<IConfiguration>();
    public StripeContext Stripe => new(ServiceProvider);
    public EmailContext Email => new(ServiceProvider);

    protected abstract IIntegrationTestEntrypoint GetEntrypoint(TOptions options);

    protected IntegrationTestEnvironment(TOptions options = null)
    {
        options ??= new TOptions();

        EnvironmentHelper.SetRunningInTestFlag();

        entrypoint = GetEntrypoint(options);
        ServiceProvider = entrypoint.ScopeProvider;
    }

    protected virtual async Task InitializeAsync()
    {
        var dockerDependencyService = new DockerDependencyService(ServiceProvider);
        await dockerDependencyService.StartAsync(default);
            
        await entrypoint.WaitUntilReadyAsync();
    }

    public async ValueTask DisposeAsync()
    {
        await entrypoint.DisposeAsync();
    }
}