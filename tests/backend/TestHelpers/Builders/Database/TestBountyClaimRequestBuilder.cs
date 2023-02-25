using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Builders;
using Sponsorkit.Tests.TestHelpers.Environments;

namespace Sponsorkit.Tests.TestHelpers.Builders.Database;

public class TestBountyClaimRequestBuilder : BountyClaimRequestBuilder
{
    private readonly IIntegrationTestEnvironment environment;

    public TestBountyClaimRequestBuilder(IIntegrationTestEnvironment environment)
    {
        this.environment = environment;
    }

    public override async Task<BountyClaimRequest> BuildAsync(CancellationToken cancellationToken = default)
    {
        PullRequest ??= await environment.Database.PullRequestBuilder.BuildAsync(cancellationToken);
        
        Bounty ??= await environment.Database.BountyBuilder
            .WithCreator(Creator!)
            .BuildAsync(cancellationToken);
        
        var model = await base.BuildAsync(cancellationToken);
        
        await environment.Database.Context.BountyClaimRequests.AddAsync(model, cancellationToken);
        await environment.Database.Context.SaveChangesAsync(cancellationToken);

        return model;
    }
}