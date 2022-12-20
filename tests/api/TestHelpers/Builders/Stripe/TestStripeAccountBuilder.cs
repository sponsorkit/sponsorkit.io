using System;
using System.Threading;
using System.Threading.Tasks;
using CliWrap;
using MediatR;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Domain.Models.Stripe;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Builders.Stripe;

public class TestStripeAccountBuilder : StripeAccountBuilder
{
    private readonly AccountService accountService;
    private readonly IMediator mediator;

    private bool isVerificationCompleted;

    public TestStripeAccountBuilder(
        AccountService accountService,
        IMediator mediator) : base(accountService)
    {
        this.accountService = accountService;
        this.mediator = mediator;

        WithEmail("some-email@example.com");
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
        var accountLink = await mediator.Send(
            new CreateStripeConnectActivationLinkCommand(
                account.Id,
                Guid.NewGuid()),
            cancellationToken);
        
        await Cli.Wrap("npx")
            .WithArguments(x => x
                .Add("--yes")
                .Add("@sponsorkit/stripe-onboarder")
                .Add("onboard")
                .Add(accountLink.Url)
                .Add(new [] {"--headless", "false"})
                .Add(new [] {"--country", "DK"})
                .Add(new [] {"--address.zip", "8000"})
                .Add(new [] {"--phone", "00000000"})
            )
            .WithStandardErrorPipe(PipeTarget.ToDelegate(Console.Error.WriteLine))
            .WithStandardOutputPipe(PipeTarget.ToDelegate(Console.WriteLine))
            .WithValidation(CommandResultValidation.None)
            .ExecuteAsync();
    }
}