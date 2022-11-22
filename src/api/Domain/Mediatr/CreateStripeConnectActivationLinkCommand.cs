using System;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Sponsorkit.Domain.Helpers;
using Stripe;

namespace Sponsorkit.Domain.Mediatr;

public record CreateStripeConnectActivationLinkCommand(
    string StripeConnectId, 
    Guid BroadcastId) : IRequest<AccountLink>;

public class CreateStripeConnectActivationLinkCommandHandler : IRequestHandler<CreateStripeConnectActivationLinkCommand, AccountLink>
{
    private readonly AccountLinkService accountLinkService;

    public CreateStripeConnectActivationLinkCommandHandler(
        AccountLinkService accountLinkService)
    {
        this.accountLinkService = accountLinkService;
    }

    public async Task<AccountLink> Handle(CreateStripeConnectActivationLinkCommand request, CancellationToken cancellationToken)
    {
        var linkResponse = await accountLinkService.CreateAsync(
            new AccountLinkCreateOptions()
            {
                Account = request.StripeConnectId,
                RefreshUrl = LinkHelper.GetStripeConnectActivateUrl(request.BroadcastId),
                ReturnUrl = LinkHelper.GetLandingPageUrl($"/landing/stripe-connect/activated", request.BroadcastId),
                Type = "account_onboarding"
            }, 
            cancellationToken: cancellationToken);
        return linkResponse;
    }
}