using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Domain.Models.Database;
using Sponsorkit.Domain.Models.Database.Builders;
using Sponsorkit.Tests.TestHelpers.Environments;

namespace Sponsorkit.Tests.TestHelpers.Builders.Database;

public class TestRepositoryBuilder : RepositoryBuilder
{
    private readonly IIntegrationTestEnvironment environment;

    public TestRepositoryBuilder(IIntegrationTestEnvironment environment)
    {
        this.environment = environment;
        
        WithGitHubInformation(
            1337,
            "some-owner-name", 
            "some-name");
    }

    public override async Task<Repository> BuildAsync(CancellationToken cancellationToken = default)
    {
        var model = await base.BuildAsync(cancellationToken);
        
        await environment.Database.Context.Repositories.AddAsync(model, cancellationToken);
        await environment.Database.Context.SaveChangesAsync(cancellationToken);

        return model;
    }
}

public class TestPullRequestBuilder : PullRequestBuilder
{
    private readonly IIntegrationTestEnvironment environment;

    public TestPullRequestBuilder(IIntegrationTestEnvironment environment)
    {
        this.environment = environment;
    }

    public override async Task<PullRequest> BuildAsync(CancellationToken cancellationToken = default)
    {
        var model = await base.BuildAsync(cancellationToken);
        
        await environment.Database.Context.PullRequests.AddAsync(model, cancellationToken);
        await environment.Database.Context.SaveChangesAsync(cancellationToken);

        return model;
    }
}

public class TestBountyBuilder : BountyBuilder
{
    private readonly IIntegrationTestEnvironment environment;

    public TestBountyBuilder(IIntegrationTestEnvironment environment)
    {
        this.environment = environment;
    }

    public override async Task<Bounty> BuildAsync(CancellationToken cancellationToken = default)
    {
        var model = await base.BuildAsync(cancellationToken);
        
        await environment.Database.Context.Bounties.AddAsync(model, cancellationToken);
        await environment.Database.Context.SaveChangesAsync(cancellationToken);

        return model;
    }
}