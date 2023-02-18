using System.Diagnostics.CodeAnalysis;
using Microsoft.EntityFrameworkCore;
using Octokit;
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
    private readonly IGitHubClient gitHubClient;

    public string Identifier => "payout";

    public PayoutJob(
        DataContext dataContext,
        PaymentIntentService paymentIntentService,
        IGitHubClient gitHubClient)
    {
        this.dataContext = dataContext;
        this.paymentIntentService = paymentIntentService;
        this.gitHubClient = gitHubClient;
    }
    
    public async Task ExecuteAsync(CancellationToken cancellationToken)
    {
        //each issue has multiple bounties. up to one per user.
        var bountyClaimRequestsByIssueId = await dataContext.BountyClaimRequests
            .Include(x => x.Creator.StripeConnectId)
            .Include(x => x.Bounty.Creator)
            .AsQueryable()
            .Where(x => 
                x.ExpiredAt == null && 
                x.Bounty.AwardedToId == null)
            .GroupBy(x => new
            {
                x.Bounty.IssueId
            })
            .Select(x => new
            {
                x.Key.IssueId,
                ClaimRequests = x
            })
            .ToArrayAsync(cancellationToken);
        foreach (var claimRequestsForIssue in bountyClaimRequestsByIssueId)
        {
            var overallVerdict = claimRequestsForIssue.ClaimRequests
                .Where(x => x.Verdict != ClaimVerdict.Undecided)
                .GroupBy(x => x.Verdict)
                .OrderByDescending(x => x.Count())
                .Select(x => x.Key)
                .FirstOrDefault();
            if (overallVerdict == ClaimVerdict.Undecided)
                overallVerdict = ClaimVerdict.Solved;
                
            foreach (var claimRequest in claimRequestsForIssue.ClaimRequests)
            {
                var finalVerdict = claimRequest.Verdict;
                if (finalVerdict == ClaimVerdict.Undecided)
                {
                    finalVerdict = overallVerdict;
                }

                if (finalVerdict == ClaimVerdict.Solved)
                {
                    await PayoutFundsAsync(claimRequest);
                }
                else
                {
                    await RedistributeFundsToTopOpenSourceIssuesAsync(claimRequest);
                }
            }
        }
    }

    [SuppressMessage("ReSharper", "UnusedParameter.Local")]
    private async Task RedistributeFundsToTopOpenSourceIssuesAsync(BountyClaimRequest claimRequest)
    {
        await gitHubClient.Search.SearchIssues(new()
        {
            Archived = false,
            State = ItemState.Open,
            Type = IssueTypeQualifier.Issue,
            Parameters =
            {
                {"sort", "reactions-+1-desc "},
                {"is", "open"},
                {"is", "issue"},
                {"archived", "false"},
                {"sort", "reactions-+1-desc"}
            }
        });
            
        throw new NotImplementedException();
    }

    private async Task PayoutFundsAsync(BountyClaimRequest claimRequest)
    {
        var stripeConnectId = claimRequest.Creator.StripeConnectId;
        if (stripeConnectId == null)
            throw new InvalidOperationException("The creator of the claim request does not have a Stripe Connect ID.");
        
        foreach (var payment in claimRequest.Bounty.Payments)
        {
            if(payment.TransferredToConnectedAccountAt != null)
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