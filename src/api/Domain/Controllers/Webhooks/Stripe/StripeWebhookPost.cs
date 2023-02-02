﻿using System;
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
using Microsoft.Extensions.Options;
using Serilog;
using Serilog.Context;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Infrastructure.Logging.HttpContext;
using Sponsorkit.Infrastructure.Options;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Webhooks.Stripe;

public class Post : EndpointBaseAsync
    .WithoutRequest
    .WithoutResult
{
    private readonly IOptionsMonitor<StripeOptions> stripeOptionsMonitor;
    private readonly IEnumerable<IStripeEventHandler> webhookEventHandlers;
    private readonly ILogger logger;
    private readonly IMediator mediator;

    public Post(
        IOptionsMonitor<StripeOptions> stripeOptionsMonitor,
        IEnumerable<IStripeEventHandler> webhookEventHandlers,
        ILogger logger,
        IMediator mediator)
    {
        this.stripeOptionsMonitor = stripeOptionsMonitor;
        this.webhookEventHandlers = webhookEventHandlers;
        this.logger = logger;
        this.mediator = mediator;
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
            var stripeEvent = EventUtility.ConstructEvent(
                json,
                signatureHeader,
                stripeOptionsMonitor.CurrentValue.WebhookSecretKey);

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
        catch (EventAlreadyHandledException ex)
        {
            logger.Information(ex, "Already handled event.");
            return Ok("Already handled.");
        }
    }
}