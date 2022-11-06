using System;
using System.Diagnostics.CodeAnalysis;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Sponsorkit.Infrastructure;
using Sponsorkit.Infrastructure.AspNet.HostedServices;
using Sponsorkit.Infrastructure.Security.Encryption;
using Sponsorkit.Tests.TestHelpers.Environments.Contexts;
using Migration = Microsoft.EntityFrameworkCore.Migrations.Migration;

namespace Sponsorkit.Tests.TestHelpers.Environments;

public interface IIntegrationTestEnvironment
{
    public IServiceProvider ServiceProvider { get; }

    public IMediator Mediator { get; }
    public IAesEncryptionHelper EncryptionHelper  { get; }
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

    public IMediator Mediator => ServiceProvider.GetRequiredService<Mediator>();
    public IAesEncryptionHelper EncryptionHelper => ServiceProvider.GetRequiredService<IAesEncryptionHelper>();
    public DatabaseContext Database => new (entrypoint, this);
    public GitHubContext GitHub => new ();
    public IConfiguration Configuration => ServiceProvider.GetRequiredService<IConfiguration>();
    public StripeContext Stripe => new(ServiceProvider);

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
        await DowngradeDatabaseAsync();
        await entrypoint.DisposeAsync();
    }

    private async Task DowngradeDatabaseAsync()
    {
        await Database.WithoutCachingAsync(async context =>
        {
            await context
                .GetService<IMigrator>()
                .MigrateAsync(Migration.InitialDatabase);

            await context.SaveChangesAsync();
        });
    }
}