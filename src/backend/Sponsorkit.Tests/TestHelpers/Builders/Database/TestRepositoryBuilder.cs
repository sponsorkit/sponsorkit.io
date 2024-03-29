﻿using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Builders;
using Sponsorkit.BusinessLogic.Infrastructure;
using Sponsorkit.Tests.TestHelpers.Environments;

namespace Sponsorkit.Tests.TestHelpers.Builders.Database;

public class TestRepositoryBuilder : RepositoryBuilder
{
    private readonly IIntegrationTestEnvironment environment;

    public TestRepositoryBuilder(IIntegrationTestEnvironment environment)
    {
        this.environment = environment;
        
        WithGitHubInformation(
            TestConstants.PlaygroundRepositoryId,
            "sponsorkit", 
            "playground");
    }

    public override async Task<Repository> BuildAsync(CancellationToken cancellationToken = default)
    {
        var model = await base.BuildAsync(cancellationToken);
        
        await environment.Database.Context.Repositories.AddAsync(model, cancellationToken);
        await environment.Database.Context.SaveChangesAsync(cancellationToken);

        return model;
    }
}