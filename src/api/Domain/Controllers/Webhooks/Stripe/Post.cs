using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Ardalis.Result;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Serilog;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers;
using Sponsorkit.Domain.Mediatr;
using Sponsorkit.Domain.Models;
using Sponsorkit.Infrastructure.Options;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Webhooks.Stripe
{
    public record Request;

    public class Post : BaseAsyncEndpoint
        .WithRequest<Request>
        .WithoutResponse
    {
        private readonly DataContext dataContext;

        private readonly IMediator mediator;
        private readonly IOptionsMonitor<StripeOptions> stripeOptionsMonitor;
        private readonly IEnumerable<IWebhookEventHandler> webhookEventHandlers;
        private readonly ILogger logger;

        public Post(
            DataContext dataContext,
            IMediator mediator,
            IOptionsMonitor<StripeOptions> stripeOptionsMonitor,
            IEnumerable<IWebhookEventHandler> webhookEventHandlers,
            ILogger logger)
        {
            this.dataContext = dataContext;
            this.mediator = mediator;
            this.stripeOptionsMonitor = stripeOptionsMonitor;
            this.webhookEventHandlers = webhookEventHandlers;
            this.logger = logger;
        }

        [HttpPost("/webhooks/stripe")]
        [AllowAnonymous]
        public override async Task<ActionResult> HandleAsync(Request request, CancellationToken cancellationToken = new CancellationToken())
        {
            var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
            if (!IsValidStripeWebhookIpAddress(ipAddress))
                return BadRequest();

            using var reader = new StreamReader(HttpContext.Request.Body);
            var json = await reader.ReadToEndAsync();

            try
            {
                var signatureHeader = Request.Headers["Stripe-Signature"];
                var stripeEvent = EventUtility.ConstructEvent(
                    json,
                    signatureHeader,
                    stripeOptionsMonitor.CurrentValue.WebhookSecretKey);

                var elligibleEventHandlers = webhookEventHandlers.Where(x => 
                    x.CanHandle(stripeEvent.Type));
                foreach (var eventHandler in elligibleEventHandlers)
                {
                    await eventHandler.HandleAsync(
                        stripeEvent.Data.Object);
                }
                
                return Ok();
            }
            catch (StripeException e)
            {
                logger.Error(e, "A Stripe webhook error occured.");
                return BadRequest();
            }
        }

        /// <summary>
        /// Validates whether or not the request is coming from Stripe's servers.
        /// The list comes from: https://stripe.com/docs/ips
        /// </summary>
        private static bool IsValidStripeWebhookIpAddress(string? ipAddress)
        {
            if (ipAddress == null)
                return false;

            var allowedIpAddresses = new[]
            {
                "3.18.12.63", 
                "3.130.192.231", 
                "13.235.14.237", 
                "13.235.122.149", 
                "35.154.171.200", 
                "52.15.183.38", 
                "54.187.174.169", 
                "54.187.205.235",
                "54.187.216.72", 
                "54.241.31.99", 
                "54.241.31.102", 
                "54.241.34.107"
            };
            return allowedIpAddresses.Contains(ipAddress);
        }
    }
}