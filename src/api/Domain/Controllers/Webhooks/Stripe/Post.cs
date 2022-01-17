using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Serilog;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.Options;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Webhooks.Stripe;

public class Post : EndpointBaseAsync
    .WithoutRequest
    .WithoutResult
{
    private readonly IOptionsMonitor<StripeOptions> stripeOptionsMonitor;
    private readonly IEnumerable<IWebhookEventHandler> webhookEventHandlers;
    private readonly ILogger logger;
    private readonly DataContext dataContext;

    public Post(
        IOptionsMonitor<StripeOptions> stripeOptionsMonitor,
        IEnumerable<IWebhookEventHandler> webhookEventHandlers,
        ILogger logger,
        DataContext dataContext)
    {
        this.stripeOptionsMonitor = stripeOptionsMonitor;
        this.webhookEventHandlers = webhookEventHandlers;
        this.logger = logger;
        this.dataContext = dataContext;
    }

    [HttpPost("/webhooks/stripe")]
    [AllowAnonymous]
    [DisableCors]
    public override async Task<ActionResult> HandleAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            await using var stream = HttpContext.Request.Body;
            stream.Seek(0, SeekOrigin.Begin);

            using var reader = new StreamReader(stream);
            var json = await reader.ReadToEndAsync();

            var signatureHeader = Request.Headers["Stripe-Signature"];
            var stripeEvent = EventUtility.ConstructEvent(
                json,
                signatureHeader,
                stripeOptionsMonitor.CurrentValue.WebhookSecretKey);

            var elligibleEventHandlers = webhookEventHandlers.Where(x =>
                x.CanHandle(
                    stripeEvent.Type,
                    stripeEvent.Data.Object));
            foreach (var eventHandler in elligibleEventHandlers)
            {
                await eventHandler.HandleAsync(
                    stripeEvent.Id,
                    stripeEvent.Data.Object,
                    cancellationToken);
            }

            return Ok();
        }
        catch (StripeException e)
        {
            logger.Error(e, "A Stripe webhook error occured.");
            return BadRequest("A Stripe webhook error occured.");
        }
        catch (EventAlreadyHandledException ex)
        {
            logger.Information(ex, "Already handled event.");
            return Ok("Already handled.");
        }
    }
}