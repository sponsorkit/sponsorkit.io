using System;
using System.Diagnostics.CodeAnalysis;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Octokit;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure;
using Sponsorkit.Infrastructure.AspNet;
using Sponsorkit.Infrastructure.AspNet.HostedServices;
using Sponsorkit.Infrastructure.Security.Encryption;
using Migration = Microsoft.EntityFrameworkCore.Migrations.Migration;

namespace Sponsorkit.Tests.TestHelpers.Environments
{

    [ExcludeFromCodeCoverage]
    public abstract class IntegrationTestEnvironment<TOptions> : IAsyncDisposable
        where TOptions : class, new()
    {
        private readonly IIntegrationTestEntrypoint entrypoint;

        public IServiceProvider ServiceProvider { get; }

        public IMediator Mediator => ServiceProvider.GetRequiredService<Mediator>();
        public IAesEncryptionHelper EncryptionHelper => ServiceProvider.GetRequiredService<IAesEncryptionHelper>();
        public DatabaseContext Database => new (entrypoint);
        public IConfiguration Configuration => ServiceProvider.GetRequiredService<IConfiguration>();
        public StripeEnvironmentContext Stripe => new(ServiceProvider);

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
}
