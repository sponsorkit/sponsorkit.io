using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Ardalis.Result;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.BusinessLogic.Domain.Helpers;
using Sponsorkit.BusinessLogic.Domain.Mediatr;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Sponsorkit.BusinessLogic.Domain.Models.Stripe;
using Sponsorkit.BusinessLogic.Domain.Models.Stripe.Metadata;
using Sponsorkit.BusinessLogic.Infrastructure.AspNet;
using Sponsorkit.BusinessLogic.Infrastructure.Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.SetupIntent;

public record GitHubIssueRequest(
    string OwnerName,
    string RepositoryName,
    int IssueNumber);
    
public record PostRequest(
    GitHubIssueRequest Issue,
    long AmountInHundreds);

public record PaymentIntentResponse(
    string ClientSecret,
    string Id);
    
public record PostResponse(
    PaymentIntentResponse PaymentIntent,
    string? ExistingPaymentMethodId);

public class SetupIntentPost : EndpointBaseAsync
    .WithRequest<PostRequest>
    .WithActionResult<PostResponse>
{
    private readonly DataContext dataContext;
    private readonly StripeSetupIntentBuilder setupIntentBuilder;
    
    private readonly IMediator mediator;

    public SetupIntentPost(
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
            return NotFound("Issue or repository was not found.");

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
            new (intent.ClientSecret, intent.Id),
            paymentMethod?.Id);
    }
}