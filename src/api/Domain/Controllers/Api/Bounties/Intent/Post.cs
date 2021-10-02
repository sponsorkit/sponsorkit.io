using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Ardalis.Result;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.Intent
{
    public record GitHubIssueRequest(
        string OwnerName,
        string RepositoryName,
        int IssueNumber);
    
    public record PostRequest(
        GitHubIssueRequest Issue,
        int AmountInHundreds);
    
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
    }
    
    public class Post : BaseAsyncEndpoint
        .WithRequest<PostRequest>
        .WithResponse<PostResponse>
    {
        private readonly DataContext dataContext;
        private readonly SetupIntentService setupIntentService;
        private readonly IMediator mediator;

        public Post(
            DataContext dataContext,
            SetupIntentService setupIntentService,
            IMediator mediator)
        {
            this.dataContext = dataContext;
            this.setupIntentService = setupIntentService;
            this.mediator = mediator;
        }
        
        [HttpPost("/bounties/payment-intent")]
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

            if (request.AmountInHundreds < 10_00)
                return BadRequest("Minimum amount is 10 USD.");

            var userId = User.GetRequiredId();
            var user = await dataContext.Users.SingleAsync(
                x => x.Id == userId,
                cancellationToken);
            
            var paymentMethod = await mediator.Send(
                new GetPaymentMethodForCustomerQuery(user.StripeCustomerId),
                cancellationToken);

            var feeInHundreds = FeeCalculator.GetSponsorkitFeeInHundreds(request.AmountInHundreds);
            
            var intent = await setupIntentService.CreateAsync(
                new SetupIntentCreateOptions()
                {
                    Confirm = false,
                    Customer = user.StripeCustomerId,
                    PaymentMethod = paymentMethod?.Id,
                    Usage = "off_session",
                    Metadata = new Dictionary<string, string>()
                    {
                        { UniversalMetadataKeys.Type, UniversalMetadataTypes.BountySetupIntent },
                        { MetadataKeys.AmountInHundreds, request.AmountInHundreds.ToString(CultureInfo.InvariantCulture) },
                        { MetadataKeys.FeeInHundreds, feeInHundreds.ToString(CultureInfo.InvariantCulture) },
                        { MetadataKeys.GitHubIssueNumber, request.Issue.IssueNumber.ToString(CultureInfo.InvariantCulture) },
                        { MetadataKeys.GitHubIssueOwnerName, request.Issue.OwnerName },
                        { MetadataKeys.GitHubIssueRepositoryName, request.Issue.RepositoryName },
                        { MetadataKeys.UserId, user.Id.ToString() }
                    }
                },
                cancellationToken: cancellationToken);

            return new PostResponse(
                intent.ClientSecret,
                paymentMethod?.Id);
        }
    }
}