using System;
using Sponsorkit.BusinessLogic.Domain.Models.Stripe;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Builders.Stripe;

public class TestStripePaymentMethodBuilder : StripePaymentMethodBuilder
{
    public TestStripePaymentMethodBuilder(PaymentMethodService paymentMethodService) : base(paymentMethodService)
    {
        WithCvc("123");
        WithCardNumber(4242_4242_4242_4242.ToString());
        WithExpiry(DateTime.Now.Month, DateTime.Now.Year + 2);
    }
}