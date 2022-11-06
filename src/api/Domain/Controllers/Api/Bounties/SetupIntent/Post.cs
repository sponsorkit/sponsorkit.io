using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Ardalis.Result;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Domain.Models.Database.Context;
using Sponsorkit.Domain.Models.Stripe;
using Sponsorkit.Domain.Models.Stripe.Metadata;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.SetupIntent;

public record GitHubIssueRequest(
    string OwnerName,
    string RepositoryName,
    int IssueNumber);
    
public record PostRequest(
    GitHubIssueRequest Issue,
    long AmountInHundreds);
    
public record PostResponse(
    string PaymentIntentClientSecret,
    string? ExistingPaymentMethodId);

public static class MetadataKeys
{
    public const string GitHubIssueOwnerName = "GitHubIssueOwnerName";
    public const string GitHubIssueRepositoryName = "GitHubIssueRepositoryName";
    public const string GitHubIssueNumber = "GitHubIssueNumber";
    public const string AmountInHundreds = "AmountInHundreds";
    public const string UserId = "UserId";
    public const string FeeInHundreds = "FeeInHundreds";
    public const string BountyId = "BountyId";
    public const string PaymentId = "PaymentId";
    public const string ClaimRequestId = "ClaimRequestId";
}

public class Post : EndpointBaseAsync
    .WithRequest<PostRequest>
    .WithActionResult<PostResponse>
{
    private readonly DataContext dataContext;
    private readonly StripeSetupIntentBuilder setupIntentBuilder;
    
    private readonly IMediator mediator;

    public Post(
        DataContext dataContext,
        StripeSetupIntentBuilder setupIntentBuilder,
        IMediator mediator)
    {
        this.dataContext = dataContext;
        this.setupIntentBuilder = setupIntentBuilder;
        this.mediator = mediator;
    }
        
    [HttpPost("bounties/setup-intent")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public override async Task<ActionResult<PostResponse>> HandleAsync([FromBody] PostRequest request, CancellationToken cancellationToken = default)
    {
        var issue = await mediator.Send(
            new EnsureGitHubIssueInDatabaseCommand(
                request.Issue.OwnerName,
                request.Issue.RepositoryName,
                request.Issue.IssueNumber),
            cancellationToken);
        if (issue.Status == ResultStatus.NotFound)
            return NotFound();

        if (request.AmountInHundreds < Constants.MinimumBountyAmountInHundreds)
            return BadRequest("Minimum amount is 10 USD.");

        var userId = User.GetRequiredId();
        var user = await dataContext.Users.SingleAsync(
            x => x.Id == userId,
            cancellationToken);
            
        var paymentMethod = await mediator.Send(
            new GetPaymentMethodForCustomerQuery(user.StripeCustomerId),
            cancellationToken);

        var feeInHundreds = FeeCalculator.GetSponsorkitFeeInHundreds(request.AmountInHundreds);

        var intent = await setupIntentBuilder
            .WithUser(user)
            .WithPaymentMethod(paymentMethod)
            .WithIdempotencyKey(
                $"bounty-setup-intent-{Request.GetIdempotencyKey()}-{userId}-{request.Issue.OwnerName}-{request.Issue.RepositoryName}-{request.Issue.IssueNumber}-{request.AmountInHundreds}")
            .WithMetadata(new StripeBountySetupIntentMetadataBuilder()
                .WithUser(user)
                .WithAmountInHundreds(
                    request.AmountInHundreds,
                    feeInHundreds)
                .WithGitHubIssue(
                    request.Issue.OwnerName,
                    request.Issue.RepositoryName,
                    request.Issue.IssueNumber))
            .BuildAsync(cancellationToken);
            
        return new PostResponse(
            intent.ClientSecret,
            paymentMethod?.Id);
    }
}