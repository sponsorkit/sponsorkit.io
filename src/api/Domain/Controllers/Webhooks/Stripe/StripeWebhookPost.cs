using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Serilog;
using Serilog.Context;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Infrastructure.Logging.HttpContext;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Webhooks.Stripe;

public class StripeWebhookPost : EndpointBaseAsync
    .WithoutRequest
    .WithoutResult
{
    private readonly IEnumerable<IStripeEventHandler> webhookEventHandlers;
    private readonly ILogger logger;
    private readonly IMediator mediator;
    private readonly IEventFactory eventFactory;

    public StripeWebhookPost(
        IEnumerable<IStripeEventHandler> webhookEventHandlers,
        ILogger logger,
        IMediator mediator,
        IEventFactory eventFactory)
    {
        this.webhookEventHandlers = webhookEventHandlers;
        this.logger = logger;
        this.mediator = mediator;
        this.eventFactory = eventFactory;
    }

    [HttpPost("webhooks/stripe")]
    [AllowAnonymous]
    [DisableCors]
    public override async Task<ActionResult> HandleAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            await using var stream = Request.Body;
            stream.Seek(0, SeekOrigin.Begin);

            using var reader = new StreamReader(stream);
            var json = await reader.ReadToEndAsync(cancellationToken);
            
            var signatureHeader = Request.Headers["Stripe-Signature"];
            var stripeEvent = eventFactory.CreateEvent(
                json,
                signatureHeader);

            try
            {
                using (LogContext.Push(new HttpContextEnricher(HttpContext)))
                {
                    var elligibleEventHandlers = webhookEventHandlers.Where(x =>
                        x.CanHandleWebhookType(
                            stripeEvent.Type,
                            stripeEvent.Data.Object));
                    foreach (var eventHandler in elligibleEventHandlers)
                    {
                        await eventHandler.HandleAsync(
                            stripeEvent.Id,
                            stripeEvent.Data.Object,
                            cancellationToken);
                    }
                    
                    await mediator.Publish(
                        new StripeWebhookEvent(stripeEvent),
                        cancellationToken);
                }
            }
            catch (EventAlreadyHandledException ex)
            {
                logger.Information(ex, "Already handled event.");
                return Ok("Already handled.");
            }
            catch (Exception ex)
            {
                logger.Error(ex, "A Stripe webhook error occured.");

                await mediator.Publish(
                    new BackgroundEndpointErrorEvent(ex),
                    cancellationToken);

                var buffer = Encoding.UTF8.GetBytes(ex.ToString());
                await Response.Body.WriteAsync(buffer, cancellationToken);
            }

            return Ok();
        }
        catch (StripeException e)
        {
            logger.Error(e, "A Stripe webhook error occured.");
            
            await mediator.Publish(
                new BackgroundEndpointErrorEvent(e),
                cancellationToken);
            
            return BadRequest("A Stripe webhook error occured.");
        }
    }
}