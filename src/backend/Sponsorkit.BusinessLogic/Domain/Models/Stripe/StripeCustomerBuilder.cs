﻿using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Stripe;

namespace Sponsorkit.BusinessLogic.Domain.Models.Stripe;

public class StripeCustomerBuilder : AsyncModelBuilder<Customer>
{
    private readonly CustomerService customerService;
    
    private User? user;
    private string? email;
    
    private StripePaymentMethodBuilder? paymentMethodBuilder;
    
    public Account? CreatedAccount { get; protected set; }

    public StripeCustomerBuilder(
        CustomerService customerService)
    {
        this.customerService = customerService;
    }

    public StripeCustomerBuilder WithUser(User user)
    {
        this.user = user;
        return this;
    }

    public StripeCustomerBuilder WithEmail(string email)
    {
        this.email = email;
        return this;
    }

    public StripeCustomerBuilder WithDefaultPaymentMethod(StripePaymentMethodBuilder paymentMethodBuilder)
    {
        this.paymentMethodBuilder = paymentMethodBuilder;
        return this;
    }
    
    public override async Task<Customer> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (user == null)
            throw new InvalidOperationException("Can't create Stripe customer without a user.");

        if (email == null)
            throw new InvalidOperationException("Can't create a Stripe customer without an e-mail address.");
        
        var customer = await customerService.CreateAsync(
            new CustomerCreateOptions()
            {
                Email = email,
                InvoiceSettings = new CustomerInvoiceSettingsOptions(),
                Metadata = new Dictionary<string, string>()
                {
                    { "UserId", user.Id.ToString() }
                }
            },
            new RequestOptions()
            {
                IdempotencyKey = $"stripe-customer-{user.Id.ToString()}"
            },
            cancellationToken);
        
        var paymentMethod = paymentMethodBuilder != null ? 
            await paymentMethodBuilder
                .WithCustomer(customer)
                .BuildAsync(CancellationToken.None) :
            null;
        if (paymentMethod != null)
        {
            await customerService.UpdateAsync(
                customer.Id,
                new CustomerUpdateOptions()
                {
                    InvoiceSettings = new CustomerInvoiceSettingsOptions()
                    {
                        DefaultPaymentMethod = paymentMethod.Id
                    }
                },
                default,
                CancellationToken.None);
            customer.InvoiceSettings.DefaultPaymentMethodId = paymentMethod.Id;
        }

        return customer;
    }
}