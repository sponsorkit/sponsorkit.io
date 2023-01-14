using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Domain.Models.Database;
using Sponsorkit.Domain.Models.Database.Builders;
using Sponsorkit.Tests.TestHelpers.Environments;

namespace Sponsorkit.Tests.TestHelpers.Builders.Database;

public class TestPullRequestBuilder : PullRequestBuilder
{
    private readonly IIntegrationTestEnvironment environment;

    public TestPullRequestBuilder(IIntegrationTestEnvironment environment)
    {
        this.environment = environment;
    }

    public override async Task<PullRequest> BuildAsync(CancellationToken cancellationToken = default)
    {
        GitHub ??= new()
        {
            Id = 1337,
            Number = 1337
        };

        Repository ??= await environment.Database.RepositoryBuilder.BuildAsync(cancellationToken);
        
        var model = await base.BuildAsync(cancellationToken);
        
        await environment.Database.Context.PullRequests.AddAsync(model, cancellationToken);
        await environment.Database.Context.SaveChangesAsync(cancellationToken);

        return model;
    }
}