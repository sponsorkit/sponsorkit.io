using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Flurl.Util;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.Domain.Helpers;
using Stripe;

namespace Sponsorkit.Domain.Api.Bounties.Intent
{
    public record Request(
        [FromQuery] long GitHubIssueId,
        [FromQuery] int AmountInHundreds);

    public record Response(
        string PaymentIntentClientSecret);

    public class Get : BaseAsyncEndpoint
        .WithRequest<Request>
        .WithResponse<Response>
    {
        private readonly PaymentIntentService paymentIntentService;

        public const string GitHubIssueIdStripeMetadataKey = "GITHUB_ISSUE_ID";
        public const string BountyAmountStripeMetadataKey = "BOUNTY_AMOUNT";

        public Get(
            PaymentIntentService paymentIntentService)
        {
            this.paymentIntentService = paymentIntentService;
        }

        [HttpGet("/api/bounties/intent")]
        public override async Task<ActionResult<Response>> HandleAsync(Request request, CancellationToken cancellationToken = new CancellationToken())
        {
            var amountInHundredsIncludingFee = FeeCalculator.GetAmountWithAllFeesOnTop(request.AmountInHundreds);
            var paymentIntent = await paymentIntentService.CreateAsync(
                new PaymentIntentCreateOptions()
                {
                    Amount = amountInHundredsIncludingFee,
                    Confirm = false,
                    Currency = "USD",
                    CaptureMethod = "manual",
                    Metadata = new Dictionary<string, string>()
                    {
                        {
                            GitHubIssueIdStripeMetadataKey, request.GitHubIssueId.ToInvariantString()
                        },
                        {
                            BountyAmountStripeMetadataKey, request.AmountInHundreds.ToInvariantString()
                        }
                    }
                },
                cancellationToken: cancellationToken);

            var charges = paymentIntent.Charges.Data;
            if (charges.Count != 1)
                throw new InvalidOperationException("Expected a single charge to be created.");

            return new Response(
                paymentIntent.ClientSecret);
        }
    }
}