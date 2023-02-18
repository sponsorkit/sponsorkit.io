using Microsoft.EntityFrameworkCore;
using Sponsorkit.BusinessLogic.Domain.Helpers;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Sponsorkit.BusinessLogic.Infrastructure.Stripe;
using Stripe;

namespace Sponsorkit.Jobs.Domain;

public class PayoutJob : IJob
{
    private readonly DataContext dataContext;
    private readonly PaymentIntentService paymentIntentService;

    public string Identifier => "payout";

    public PayoutJob(
        DataContext dataContext,
        PaymentIntentService paymentIntentService)
    {
        this.dataContext = dataContext;
        this.paymentIntentService = paymentIntentService;
    }

    public async Task ExecuteAsync(CancellationToken cancellationToken = default)
    {
        //each issue has multiple bounties. up to one per user.
        var bountyClaimRequests = await dataContext.BountyClaimRequests
            .Include(x => x.Creator)
            .Include(x => x.Bounty.Creator)
            .Include(x => x.Bounty.Payments)
            .AsQueryable()
            .Where(x =>
                x.CompletedAt == null &&
                x.Bounty.CreatedAt < DateTime.UtcNow.AddDays(Constants.VerdictPeriodDurationInDays) &&
                x.Bounty.AwardedTo == null)
            .ToArrayAsync(cancellationToken);

        var bountyClaimRequestsByIssueId = bountyClaimRequests
            .GroupBy(x => new
            {
                x.Bounty.IssueId
            })
            .Select(x => new
            {
                x.Key.IssueId,
                ClaimRequests = x
            })
            .ToArray();
        foreach (var claimRequestsForIssue in bountyClaimRequestsByIssueId)
        {
            var verdictByMostVotes = claimRequestsForIssue.ClaimRequests
                .Where(x => x.Verdict != ClaimVerdict.Undecided)
                .GroupBy(x => x.Verdict)
                .OrderByDescending(x => x.Count())
                .Select(x => x.Key)
                .FirstOrDefault(ClaimVerdict.Solved);

            foreach (var claimRequest in claimRequestsForIssue.ClaimRequests)
            {
                var finalVerdictForClaimRequest = claimRequest.Verdict;
                if (finalVerdictForClaimRequest == ClaimVerdict.Undecided)
                {
                    finalVerdictForClaimRequest = verdictByMostVotes;
                }

                if (finalVerdictForClaimRequest == ClaimVerdict.Solved)
                {
                    await PayoutFundsAsync(claimRequest);
                }

                claimRequest.CompletedAt = DateTimeOffset.Now;
                await dataContext.SaveChangesAsync(cancellationToken);
            }
        }
    }

    private async Task PayoutFundsAsync(BountyClaimRequest claimRequest)
    {
        var stripeConnectId = claimRequest.Creator.StripeConnectId;
        if (stripeConnectId == null)
            throw new InvalidOperationException("The creator of the claim request does not have a Stripe Connect ID.");

        foreach (var payment in claimRequest.Bounty.Payments)
        {
            if (payment.TransferredToConnectedAccountAt != null)
                continue;

            var sumInHundreds = payment.AmountInHundreds;
            var feeInHundreds = payment.FeeInHundreds;

            await paymentIntentService.CreateAsync(
                new PaymentIntentCreateOptions()
                {
                    Customer = claimRequest.Bounty.Creator.StripeCustomerId,
                    Amount = sumInHundreds + feeInHundreds,
                    Currency = "usd",
                    Confirm = true,
                    ApplicationFeeAmount = feeInHundreds,
                    TransferData = new PaymentIntentTransferDataOptions()
                    {
                        Amount = sumInHundreds,
                        Destination = stripeConnectId
                    },
                    OnBehalfOf = stripeConnectId,
                    ErrorOnRequiresAction = true,
                    Metadata = new Dictionary<string, string>()
                    {
                        {
                            UniversalMetadataKeys.Type, UniversalMetadataTypes.BountyPayoutPaymentIntent
                        },
                        {
                            MetadataKeys.BountyId, claimRequest.BountyId.ToString()
                        },
                        {
                            MetadataKeys.PaymentId, payment.Id.ToString()
                        },
                        {
                            MetadataKeys.ClaimRequestId, claimRequest.Id.ToString()
                        }
                    }
                },
                new RequestOptions()
                {
                    IdempotencyKey = $"bounty-payment-intent-{claimRequest.BountyId}"
                });
        }
    }
}