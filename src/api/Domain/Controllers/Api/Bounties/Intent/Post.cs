using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Ardalis.Result;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Domain.Models;
using Sponsorkit.Infrastructure.AspNet;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.Intent
{
    public record GitHubIssueRequest(
        string OwnerName,
        string RepositoryName,
        int IssueNumber);
    
    public record Request(
        GitHubIssueRequest Issue,
        int AmountInHundreds);
    
    public record Response(
        string PaymentIntentClientSecret,
        string? ExistingPaymentMethodId);

    public static class MetadataKeys
    {
        public const string GitHubIssueOwnerName = "GitHubIssueOwnerName";
        public const string GitHubIssueRepositoryName = "GitHubIssueRepositoryName";
        public const string GitHubIssueNumber = "GitHubIssueNumber";
        public const string AmountInHundreds = "AmountInHundreds";
        public const string UserId = "UserId";
    }
    
    public class Post : BaseAsyncEndpoint
        .WithRequest<Request>
        .WithResponse<Response>
    {
        private readonly DataContext dataContext;
        private readonly PaymentIntentService paymentIntentService;
        private readonly IMediator mediator;

        public Post(
            DataContext dataContext,
            PaymentIntentService paymentIntentService,
            IMediator mediator)
        {
            this.dataContext = dataContext;
            this.paymentIntentService = paymentIntentService;
            this.mediator = mediator;
        }
        
        [HttpPost("/api/bounties/payment-intent")]
        public override async Task<ActionResult<Response>> HandleAsync([FromBody] Request request, CancellationToken cancellationToken = default)
        {
            var userId = User.GetRequiredId();
            
            var issue = await mediator.Send(
                new EnsureGitHubIssueInDatabaseCommand(
                    request.Issue.OwnerName,
                    request.Issue.RepositoryName,
                    request.Issue.IssueNumber),
                cancellationToken);
            if (issue.Status == ResultStatus.NotFound)
                return NotFound();

            var user = await dataContext.Users.SingleAsync(
                x => x.Id == userId,
                cancellationToken);
            
            var paymentMethod = await mediator.Send(
                new GetPaymentMethodForCustomerQuery(user.StripeCustomerId),
                cancellationToken);

            var feeInHundreds = FeeCalculator.GetSponsorkitFeeInHundreds(request.AmountInHundreds);
            var amountToChargeInHundreds = request.AmountInHundreds + feeInHundreds;
            
            var intent = await paymentIntentService.CreateAsync(
                new PaymentIntentCreateOptions()
                {
                    Confirm = false,
                    Customer = user.StripeCustomerId,
                    PaymentMethod = paymentMethod?.Id,
                    Amount = amountToChargeInHundreds,
                    Metadata = new Dictionary<string, string>()
                    {
                        { UniversalMetadataKeys.Type, "BountyPaymentIntent" },
                        { MetadataKeys.AmountInHundreds, request.AmountInHundreds.ToString(CultureInfo.InvariantCulture) },
                        { MetadataKeys.GitHubIssueNumber, request.Issue.IssueNumber.ToString(CultureInfo.InvariantCulture) },
                        { MetadataKeys.GitHubIssueOwnerName, request.Issue.OwnerName },
                        { MetadataKeys.GitHubIssueRepositoryName, request.Issue.RepositoryName },
                        { MetadataKeys.UserId, user.Id.ToString() }
                    }
                },
                cancellationToken: cancellationToken);

            return new Response(
                intent.ClientSecret,
                paymentMethod?.Id);
        }
    }
}