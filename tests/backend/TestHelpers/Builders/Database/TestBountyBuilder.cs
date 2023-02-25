using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Builders;
using Sponsorkit.Tests.TestHelpers.Environments;

namespace Sponsorkit.Tests.TestHelpers.Builders.Database;

public class TestBountyBuilder : BountyBuilder
{
    private readonly IIntegrationTestEnvironment environment;

    public TestBountyBuilder(IIntegrationTestEnvironment environment)
    {
        this.environment = environment;
    }

    public override async Task<Bounty> BuildAsync(CancellationToken cancellationToken = default)
    {
        Issue ??= await environment.Database.IssueBuilder.BuildAsync(cancellationToken);
        
        Creator ??= await environment.Database.UserBuilder.BuildAsync(cancellationToken);
        
        var model = await base.BuildAsync(cancellationToken);
        
        await environment.Database.Context.Bounties.AddAsync(model, cancellationToken);
        await environment.Database.Context.SaveChangesAsync(cancellationToken);

        return model;
    }
}