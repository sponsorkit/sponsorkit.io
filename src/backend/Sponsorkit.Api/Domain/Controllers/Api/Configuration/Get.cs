using System;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Sponsorkit.BusinessLogic.Infrastructure.Options;
using Sponsorkit.BusinessLogic.Infrastructure.Options.GitHub;

namespace Sponsorkit.Api.Domain.Controllers.Api.Configuration;

public record Response(
    string StripeClientId,
    string GitHubClientId);
    
public class Get : EndpointBaseSync
    .WithoutRequest
    .WithActionResult<Response>
{
    private readonly IOptionsMonitor<StripeOptions> stripeOptions;
    private readonly IOptionsMonitor<GitHubOptions> gitHubOptions;

    public Get(
        IOptionsMonitor<StripeOptions> stripeOptions,
        IOptionsMonitor<GitHubOptions> gitHubOptions)
    {
        this.stripeOptions = stripeOptions;
        this.gitHubOptions = gitHubOptions;
    }
        
    [HttpGet("configuration")]
    [AllowAnonymous]
    public override ActionResult<Response> Handle()
    {
        if (stripeOptions.CurrentValue.PublishableKey == null)
            throw new InvalidOperationException("Stripe publishable key is missing.");
        
        return new Response(
            stripeOptions.CurrentValue.PublishableKey,
            gitHubOptions.CurrentValue.OAuth.ClientId);
    }
}