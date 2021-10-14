using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Builders;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Tests.TestHelpers.Builders.Models;

namespace Sponsorkit.Tests.TestHelpers.Environments
{
    public class DatabaseContext
    {
        private readonly IIntegrationTestEntrypoint entrypoint;
        public DataContext Context => entrypoint.ScopeProvider.GetRequiredService<DataContext>();

        public DatabaseContext(IIntegrationTestEntrypoint entrypoint)
        {
            this.entrypoint = entrypoint;
        }

        public async Task WithoutCachingAsync(Func<DataContext, Task> action)
        {
            await WithoutCachingAsync<object>(async (dataContext) =>
            {
                await action(dataContext);
                return null;
            });
        }

        public async Task<T> WithoutCachingAsync<T>(Func<DataContext, Task<T>> action)
        {
            using var freshScope = entrypoint.RootProvider.CreateScope();
            await using var dataContext = freshScope.ServiceProvider.GetRequiredService<DataContext>();

            var result = await action(dataContext);
            return result;
        }

        public async Task<User> CreateUserAsync(UserBuilder builder)
        {
            return await AddAsync(
                builder,
                x => x.Users);
        }

        public async Task<Issue> CreateIssueAsync(IssueBuilder builder)
        {
            return await AddAsync(
                builder,
                x => x.Issues);
        }

        private async Task<T> AddAsync<T>(
            IModelBuilder<T> builder,
            Func<DataContext, DbSet<T>> setAccessor) where T : class
        {
            var entity = builder.Build();

            var set = setAccessor(Context);
            await set.AddAsync(entity);

            await Context.SaveChangesAsync();

            return entity;
        }
    }
}