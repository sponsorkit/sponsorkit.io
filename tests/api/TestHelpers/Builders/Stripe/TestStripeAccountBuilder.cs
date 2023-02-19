using System;
using System.Threading;
using System.Threading.Tasks;
using CliWrap;
using MediatR;
using Sponsorkit.BusinessLogic.Domain.Mediatr;
using Sponsorkit.BusinessLogic.Domain.Models.Stripe;
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
        isVerificationCompleted = true;
        return this;
    }

    public override async Task<Account> BuildAsync(CancellationToken cancellationToken = default)
    {
        var account = await base.BuildAsync(cancellationToken);

        if (isVerificationCompleted)
        {
            account = await VerifyAccount(account, cancellationToken);
        }

        return account;
    }

    private async Task<Account> VerifyAccount(
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
                .Add(Environment.GetEnvironmentVariable("GITHUB_ACTIONS") == null ? 
                    new [] {"--debug", "true"} :
                    Array.Empty<string>())
                .Add(new [] {"--headless", "false"})
                .Add(new [] {"--business_type", "individual"})
            )
            .WithStandardErrorPipe(PipeTarget.ToDelegate(Console.Error.WriteLine))
            .WithStandardOutputPipe(PipeTarget.ToDelegate(Console.WriteLine))
            .WithValidation(CommandResultValidation.ZeroExitCode)
            .ExecuteAsync();

        return await accountService.GetAsync(
            account.Id, 
            cancellationToken: cancellationToken);
    }
}