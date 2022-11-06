using System;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Domain.Models.Stripe;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Builders.Stripe;

public class TestStripeAccountBuilder : StripeAccountBuilder
{
    private readonly AccountService accountService;
    
    private bool isVerificationCompleted;

    public TestStripeAccountBuilder(AccountService accountService) : base(accountService)
    {
        this.accountService = accountService;
    }

    public TestStripeAccountBuilder WithDetailsSubmitted()
    {
        this.isVerificationCompleted = true;
        return this;
    }

    public override async Task<Account> BuildAsync(CancellationToken cancellationToken = default)
    {
        var account = await base.BuildAsync(cancellationToken);

        if (isVerificationCompleted)
        {
            await VerifyAccount(account, cancellationToken);
        }

        return account;
    }

    private async Task VerifyAccount(
        Account account, 
        CancellationToken cancellationToken)
    {
        await accountService.UpdateAsync(
            account.Id,
            new AccountUpdateOptions()
            {
                TosAcceptance = new AccountTosAcceptanceOptions()
                {
                    Ip = "127.0.0.1",
                    Date = DateTime.Now
                }
            },
            default,
            cancellationToken);
    }
}