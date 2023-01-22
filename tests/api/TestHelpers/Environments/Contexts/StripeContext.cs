﻿using System;
using System.Threading.Tasks;
using Amazon.SimpleEmailV2;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Sponsorkit.Domain.Models.Stripe;
using Sponsorkit.Tests.TestHelpers.Builders.Stripe;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Environments.Contexts;

public class EmailContext
{
    private readonly IServiceProvider serviceProvider;

    public EmailContext(IServiceProvider serviceProvider)
    {
        this.serviceProvider = serviceProvider;
    }
    
    public IAmazonSimpleEmailServiceV2 FakeEmailService => serviceProvider.GetRequiredService<IAmazonSimpleEmailServiceV2>();
}

public class StripeContext
{
    private readonly IServiceProvider serviceProvider;

    public StripeSubscriptionBuilder SubscriptionBuilder => 
        new(serviceProvider.GetRequiredService<SubscriptionService>());
    
    public StripePlanBuilder PlanBuilder => 
        new(serviceProvider.GetRequiredService<PlanService>());
    
    public SetupIntentService SetupIntentService => serviceProvider.GetRequiredService<SetupIntentService>();

    public CustomerService CustomerService => serviceProvider.GetRequiredService<CustomerService>();
    public TestStripeCustomerBuilder CustomerBuilder => new(CustomerService);

    public AccountService AccountService => serviceProvider.GetRequiredService<AccountService>();
    
    public TestStripeAccountBuilder AccountBuilder => new(
        AccountService,
        serviceProvider.GetRequiredService<IMediator>());

    public TestStripePaymentMethodBuilder PaymentMethodBuilder => 
        new(serviceProvider.GetRequiredService<PaymentMethodService>());

    public StripeContext(
        IServiceProvider serviceProvider)
    {
        this.serviceProvider = serviceProvider;
    }

    public async Task WaitForWebhookAsync(string eventType)
    {
        //for now, we just wait 5 seconds. this could be greatly improved in the future.
        await Task.Delay(5000);
    }
}