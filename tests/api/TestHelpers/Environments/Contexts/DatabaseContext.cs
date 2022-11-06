using System;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Sponsorkit.Domain.Models.Database.Context;
using Sponsorkit.Tests.TestHelpers.Builders.Database;
using Sponsorkit.Tests.TestHelpers.Builders.GitHub;

namespace Sponsorkit.Tests.TestHelpers.Environments.Contexts;

public class DatabaseContext
{
    private readonly IIntegrationTestEntrypoint entrypoint;
    private readonly IIntegrationTestEnvironment environment;
    
    public DataContext Context => entrypoint.ScopeProvider.GetRequiredService<DataContext>();

    public TestUserBuilder UserBuilder => new (environment);
    public TestIssueBuilder IssueBuilder => new ();

    public DatabaseContext(
        IIntegrationTestEntrypoint entrypoint,
        IIntegrationTestEnvironment environment)
    {
        this.entrypoint = entrypoint;
        this.environment = environment;
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
}