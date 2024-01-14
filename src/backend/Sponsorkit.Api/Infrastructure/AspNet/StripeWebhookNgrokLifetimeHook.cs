using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using FluffySpoon.Ngrok;
using FluffySpoon.Ngrok.Models;
using Microsoft.Extensions.Options;
using Sponsorkit.BusinessLogic.Infrastructure.Options;
using Stripe;

namespace Sponsorkit.Api.Infrastructure.AspNet;

public class StripeWebhookNgrokLifetimeHook : INgrokLifetimeHook
{
    private readonly WebhookEndpointService? webhookEndpointService;
    private readonly IOptionsMonitor<StripeOptions>? stripeOptions;

    public StripeWebhookNgrokLifetimeHook(
        WebhookEndpointService webhookEndpointService, 
        IOptionsMonitor<StripeOptions> stripeOptions)
    {
        this.webhookEndpointService = webhookEndpointService;
        this.stripeOptions = stripeOptions;
    }

    public async Task OnCreatedAsync(TunnelResponse tunnel, CancellationToken cancellationToken)
    {
        if (webhookEndpointService == null)
            throw new InvalidOperationException("Webhook endpoint service not initialized.");

        if (stripeOptions == null)
            throw new InvalidOperationException("Stripe options could not be fetched.");

        await CleanupStripeWebhooksAsync();

        var webhookUrl = $"{tunnel.PublicUrl}/webhooks/stripe";
        Console.WriteLine($"Created Stripe webhook towards {webhookUrl}");

        var webhook = await webhookEndpointService.CreateAsync(
            new WebhookEndpointCreateOptions()
            {
                Url = webhookUrl,
                ApiVersion = "2022-11-16",
                EnabledEvents = new List<string>()
                {
                    "*"
                }
            }, 
            cancellationToken: cancellationToken);

        stripeOptions.CurrentValue.WebhookSecretKey = webhook.Secret;
    }

    public async Task OnDestroyedAsync(TunnelResponse tunnel, CancellationToken cancellationToken)
    {
        await CleanupStripeWebhooksAsync();
    }

    private async Task CleanupStripeWebhooksAsync()
    {
        if (webhookEndpointService == null)
            throw new InvalidOperationException("Webhook endpoint service not initialized.");

        try {
            var existingEndpoints = await webhookEndpointService
                .ListAutoPagingAsync()
                .ToListAsync();
            foreach (var endpoint in existingEndpoints)
            {
                if (endpoint.Url == "https://api.sponsorkit.io/webhooks/stripe")
                    continue;

                try
                {
                    await webhookEndpointService.DeleteAsync(endpoint.Id);
                }
                catch (StripeException)
                {
                    Console.WriteLine("A webhook was no longer found while trying to remove it.");
                }
            }
        }
        catch (Exception ex)
        {
            //ignore cleanup errors
            Console.WriteLine("An error occured on cleanup: " + ex);
        }
    }
}