using Sponsorkit.BusinessLogic.Domain.Helpers;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.BusinessLogic.Infrastructure.Stripe;

namespace Sponsorkit.BusinessLogic.Domain.Models.Stripe.Metadata;

public class StripeBountySetupIntentMetadataBuilder : IStripeMetadataBuilder
{
    private long? amountInHundreds;
    private long? feeInHundreds;
    
    private User? user;
    
    private string? ownerName;
    private string? repositoryName;
    private int? issueNumber;

    public string Type => UniversalMetadataTypes.BountySetupIntent;

    public StripeBountySetupIntentMetadataBuilder WithAmountInHundreds(
        long amountInHundreds,
        long feeInHundreds)
    {
        this.amountInHundreds = amountInHundreds;
        this.feeInHundreds = feeInHundreds;
        return this;
    }

    public StripeBountySetupIntentMetadataBuilder WithGitHubIssue(
        string ownerName,
        string repositoryName,
        int issueNumber)
    {
        this.ownerName = ownerName;
        this.repositoryName = repositoryName;
        this.issueNumber = issueNumber;
        
        return this;
    }

    public StripeBountySetupIntentMetadataBuilder WithUser(User user)
    {
        this.user = user;
        return this;
    }

    public IDictionary<string, string> Build()
    {
        if (amountInHundreds == null || feeInHundreds == null)
            throw new InvalidOperationException("Amount not set.");

        if (issueNumber == null || ownerName == null || repositoryName == null)
            throw new InvalidOperationException("GitHub issue not set.");

        if (user == null)
            throw new InvalidOperationException("User not set.");
        
        return new Dictionary<string, string>()
        {
            {
                MetadataKeys.AmountInHundreds, amountInHundreds.ToString()!
            },
            {
                MetadataKeys.FeeInHundreds, feeInHundreds.ToString()!
            },
            {
                MetadataKeys.GitHubIssueNumber, issueNumber.ToString()!
            },
            {
                MetadataKeys.GitHubIssueOwnerName, ownerName
            },
            {
                MetadataKeys.GitHubIssueRepositoryName, repositoryName
            },
            {
                MetadataKeys.UserId, user.Id.ToString()
            }
        };
    }
}