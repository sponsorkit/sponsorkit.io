using System;
using Ardalis.ApiEndpoints;
using AutoMapper;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.Domain.Models;
using Stripe;

namespace Sponsorkit.Domain.Api.Sponsors.BeneficiaryIdReference.Post
{
    public record Request(
        [FromRoute] Guid BeneficiaryId,
        [FromRoute] string Reference)
    {
        public int? AmountInHundreds { get; init; }
        public string? Email { get; init; }
        public string? StripeCardId { get; init; }
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
