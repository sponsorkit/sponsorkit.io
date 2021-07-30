using System;
using Ardalis.ApiEndpoints;
using AutoMapper;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.Domain.Models.Context;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Sponsors.BeneficiaryIdReference.Post
{
    public record Request(
        [FromRoute] Guid BeneficiaryId,
        [FromRoute] string Reference)
    {
        public int? AmountInHundreds { get; set; }
        public string? Email { get; set; }
        public string? StripeCardId { get; set; }
    }
    
    public class Post : BaseEndpoint
        .WithRequest<Request>
        .WithoutResponse
    {
        private readonly IMediator mediator;
        private readonly IMapper mapper;
        
        private readonly CustomerService customerService;
        private readonly PaymentMethodService paymentMethodService;
        private readonly ChargeService chargeService;
        private readonly DataContext dataContext;

        public Post(
            IMediator mediator,
            IMapper mapper,
            CustomerService customerService,
            PaymentMethodService paymentMethodService,
            ChargeService chargeService,
            DataContext dataContext)
        {
            this.mediator = mediator;
            this.mapper = mapper;
            this.customerService = customerService;
            this.paymentMethodService = paymentMethodService;
            this.chargeService = chargeService;
            this.dataContext = dataContext;
        }
        
        [HttpPost("/api/sponsors/{beneficiaryId}/{reference}")]
        public override ActionResult Handle(Request request)
        {
            throw new NotImplementedException();
        }
    }
}
