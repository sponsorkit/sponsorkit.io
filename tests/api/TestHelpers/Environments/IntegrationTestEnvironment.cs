using System;
using System.Diagnostics.CodeAnalysis;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure;
using Sponsorkit.Infrastructure.AspNet;

namespace Sponsorkit.Tests.TestHelpers.Environments
{

    [ExcludeFromCodeCoverage]
    public abstract class IntegrationTestEnvironment<TOptions> : IAsyncDisposable
        where TOptions : class, new()
    {
        private readonly IIntegrationTestEntrypoint entrypoint;

        public IServiceProvider ServiceProvider { get; }

        public IMediator Mediator => ServiceProvider.GetRequiredService<Mediator>();
        public DataContext DataContext => ServiceProvider.GetRequiredService<DataContext>();
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

        protected async Task InitializeAsync()
        {
            var dockerDependencyService = new DockerDependencyService(ServiceProvider);
            await dockerDependencyService.StartAsync(default);
            
            await entrypoint.WaitUntilReadyAsync();
        }

        public async Task WithFreshDataContext(Func<DataContext, Task> action)
        {
            await WithFreshDataContext<object>(async (dataContext) =>
            {
                await action(dataContext);
                return null;
            });
        }

        public async Task<T> WithFreshDataContext<T>(Func<DataContext, Task<T>> action)
        {
            using var freshScope = entrypoint.RootProvider.CreateScope();
            await using var dataContext = freshScope.ServiceProvider.GetRequiredService<DataContext>();

            var result = await action(dataContext);
            await dataContext.SaveChangesAsync();
            return result;
        }

        public async ValueTask DisposeAsync()
        {
            await DowngradeDatabaseAsync();
            await entrypoint.DisposeAsync();
        }

        private async Task DowngradeDatabaseAsync()
        {
            await WithFreshDataContext(async dataContext => await dataContext
                .GetService<IMigrator>()
                .MigrateAsync(Migration.InitialDatabase));
        }
    }
}
