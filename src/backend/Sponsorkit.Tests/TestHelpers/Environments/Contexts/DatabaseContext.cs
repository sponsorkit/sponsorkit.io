﻿using System;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Sponsorkit.Tests.TestHelpers.Builders.Database;

namespace Sponsorkit.Tests.TestHelpers.Environments.Contexts;

public class DatabaseContext
{
    private readonly IIntegrationTestEntrypoint entrypoint;
    private readonly IIntegrationTestEnvironment environment;
    
    public DataContext Context => entrypoint.ScopeProvider.GetRequiredService<DataContext>();

    public TestUserBuilder UserBuilder => new (environment);
    public TestIssueBuilder IssueBuilder => new (environment);
    public TestPaymentBuilder PaymentBuilder => new (environment);
    public TestRepositoryBuilder RepositoryBuilder => new (environment);
    public TestPullRequestBuilder PullRequestBuilder => new (environment);
    public TestBountyBuilder BountyBuilder => new (environment);
    public TestBountyClaimRequestBuilder BountyClaimRequestBuilder => new(environment);

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
        using var freshScope = entrypoint.ScopeProvider.CreateScope();
        await using var dataContext = freshScope.ServiceProvider.GetRequiredService<DataContext>();

        var result = await action(dataContext);
        return result;
    }
}