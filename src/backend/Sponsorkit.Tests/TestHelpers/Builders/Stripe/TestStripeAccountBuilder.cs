using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using Sponsorkit.BusinessLogic.Domain.Models.Stripe;
using Sponsorkit.BusinessLogic.Infrastructure.Options;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Builders.Stripe;

public class TestStripeAccountBuilder : StripeAccountBuilder
{
    private readonly AccountService accountService;
    private readonly IOptionsMonitor<StripeOptions> stripeOptionsMonitor;

    private bool isVerificationCompleted;

    public TestStripeAccountBuilder(
        AccountService accountService,
        IOptionsMonitor<StripeOptions> stripeOptionsMonitor) : base(accountService)
    {
        this.accountService = accountService;
        this.stripeOptionsMonitor = stripeOptionsMonitor;

        WithEmail("some-email@example.com");
    }

    public TestStripeAccountBuilder WithDetailsSubmitted()
    {
        isVerificationCompleted = true;
        return this;
    }

    public override async Task<Account> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (isVerificationCompleted)
        {
            var stripeConnectAccountId = stripeOptionsMonitor.CurrentValue.VerifiedConnectAccountId;
            if (string.IsNullOrEmpty(stripeConnectAccountId))
            {
                throw new InvalidOperationException("No Stripe Connect ID for a verified connect account was found.");
            }

            return await accountService.GetAsync(stripeConnectAccountId, cancellationToken: cancellationToken);
        }

        return await base.BuildAsync(cancellationToken);
    }
}