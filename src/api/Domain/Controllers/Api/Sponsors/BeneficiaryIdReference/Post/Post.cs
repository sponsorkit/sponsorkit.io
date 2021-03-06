using System;
using Ardalis.ApiEndpoints;
using AutoMapper;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.Domain.Models.Context;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Sponsors.BeneficiaryIdReference.Post;

public record Request(
    [FromRoute] Guid BeneficiaryId,
    [FromRoute] string Reference)
{
    public int? AmountInHundreds { get; set; }
    public string? Email { get; set; }
    public string? StripeCardId { get; set; }
}
    
public class Post : EndpointBaseSync
    .WithRequest<Request>
    .WithoutResult
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
        
    [HttpPost("/sponsors/{beneficiaryId}/{reference}")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public override void Handle(Request request)
    {
        throw new NotImplementedException();
    }
}