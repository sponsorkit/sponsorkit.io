using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
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
                            dataContext,
                            serviceProvider);
                    }
                    else
                    {
                        await RedistributeFundsToTopOpenSourceIssuesAsync(
                            claimRequest,
                            dataContext,
                            serviceProvider);
                    }
                }
            }
        }

        private static Task RedistributeFundsToTopOpenSourceIssuesAsync(
            BountyClaimRequest claimRequest,
            DataContext dataContext,
            IServiceProvider serviceProvider)
        {
            return Task.FromException(new NotImplementedException());
        }

        private static async Task PayoutFundsAsync(
            BountyClaimRequest claimRequest,
            DataContext dataContext,
            IServiceProvider serviceProvider)
        {
            var stripeConnectId = claimRequest.Creator.StripeConnectId;
            if (stripeConnectId == null)
                throw new InvalidOperationException("The creator of the claim request does not have a Stripe Connect ID.");

            //TODO: handle transactional logic.
            
            var paymentIntentService = serviceProvider.GetRequiredService<PaymentIntentService>();
            var paymentIntent = await paymentIntentService.CreateAsync(
                new PaymentIntentCreateOptions()
                {
                    //TODO: verify that amount in hundreds is including fees.
                    Customer = claimRequest.Bounty.Creator.StripeCustomerId,
                    Amount = claimRequest.Bounty.AmountInHundreds,
                    Currency = "usd",
                    Confirm = true,
                    TransferData = new PaymentIntentTransferDataOptions()
                    {
                        Amount = FeeCalculator.GetSponsorkitFeeInHundreds(
                            claimRequest.Bounty.AmountInHundreds),
                        Destination = stripeConnectId
                    },
                    Metadata = new Dictionary<string, string>()
                    {
                        //TODO: provide metadata for webhook to react to.
                    },
                    ErrorOnRequiresAction = true
                });
            
            //TODO: handle actual data on webhook.
        }

        public PayoutHostedService(IServiceProvider serviceProvider) : base(serviceProvider)
        {
        }
    }
}