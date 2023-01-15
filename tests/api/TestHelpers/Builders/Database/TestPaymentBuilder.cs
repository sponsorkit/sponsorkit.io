using System;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Domain.Models.Database;
using Sponsorkit.Domain.Models.Database.Builders;
using Sponsorkit.Tests.TestHelpers.Environments;

namespace Sponsorkit.Tests.TestHelpers.Builders.Database;

public class TestPaymentBuilder : PaymentBuilder
{
    private readonly IIntegrationTestEnvironment environment;

    public TestPaymentBuilder(IIntegrationTestEnvironment environment)
    {
        this.environment = environment;

        WithStripeId("stripe-id" + Guid.NewGuid());
        WithStripeEventId("stripe-event-id-" + Guid.NewGuid());
    }

    public override async Task<Payment> BuildAsync(CancellationToken cancellationToken = default)
    {
        var payment = await base.BuildAsync(cancellationToken);

        await environment.Database.Context.Payments.AddAsync(payment, cancellationToken);
        await environment.Database.Context.SaveChangesAsync(cancellationToken);

        return payment;
    }
}