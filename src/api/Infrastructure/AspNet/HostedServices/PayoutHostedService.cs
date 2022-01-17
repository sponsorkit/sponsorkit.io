using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Octokit;
using Sponsorkit.Domain.Controllers.Api.Bounties.PaymentIntent;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Context;
using Stripe;

namespace Sponsorkit.Infrastructure.AspNet.HostedServices
{
    public class PayoutHostedService : TimedHostedService
    {
        protected override TimeSpan Interval => TimeSpan.FromHours(1);
        
        protected override async Task RunJobAsync(
            IServiceProvider serviceProvider, 
            CancellationToken cancellationToken)
        {
            var dataContext = serviceProvider.GetRequiredService<DataContext>();
            var gitHubClient = serviceProvider.GetRequiredService<IGitHubClient>();
            
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
                        await PayoutFundsAsync(
                            claimRequest,
                            serviceProvider);
                    }
                    else
                    {
                        await RedistributeFundsToTopOpenSourceIssuesAsync(
                            claimRequest,
                            dataContext,
                            serviceProvider,
                            gitHubClient);
                    }
                }
            }
        }

        private static async Task RedistributeFundsToTopOpenSourceIssuesAsync(
            BountyClaimRequest claimRequest,
            DataContext dataContext,
            IServiceProvider serviceProvider,
            IGitHubClient gitHubClient)
        {
            await gitHubClient.Search.SearchIssues(new()
            {
                Archived = false,
                State = ItemState.Open,
                Type = IssueTypeQualifier.Issue,
                Parameters =
                {
                    {"sort", "bar"}
                }
                //is:open is:issue archived:false sort:reactions-+1-desc 
            });
            
            throw new NotImplementedException();
        }

        private static async Task PayoutFundsAsync(
            BountyClaimRequest claimRequest,
            IServiceProvider serviceProvider)
        {
            var stripeConnectId = claimRequest.Creator.StripeConnectId;
            if (stripeConnectId == null)
                throw new InvalidOperationException("The creator of the claim request does not have a Stripe Connect ID.");

            var paymentIntentService = serviceProvider.GetRequiredService<PaymentIntentService>();
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

        public PayoutHostedService(IServiceProvider serviceProvider) : base(serviceProvider)
        {
        }
    }
}