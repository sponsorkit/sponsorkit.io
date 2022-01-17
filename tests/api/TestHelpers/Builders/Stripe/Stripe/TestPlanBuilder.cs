using System;
using System.Threading.Tasks;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Builders.Stripe.Stripe;

public enum PlanInterval
{
    Month
}

public enum PlanCurrency
{
    Usd
}

public class TestPlanBuilder
{
    private readonly PlanService planService;

    private PlanInterval interval;
    private PlanCurrency currency;
    private int amountInHundreds;
    private string id;

    public TestPlanBuilder(
        PlanService planService)
    {
        this.planService = planService;

        WithInterval(PlanInterval.Month);
        WithCurrency(PlanCurrency.Usd);
        WithAmountInHundreds(1_00);
    }

    public TestPlanBuilder WithInterval(PlanInterval value)
    {
        interval = value;
        return this;
    }

    public TestPlanBuilder WithCurrency(PlanCurrency value)
    {
        currency = value;
        return this;
    }

    public TestPlanBuilder WithAmountInHundreds(int value)
    {
        amountInHundreds = value;
        return this;
    }

    public TestPlanBuilder WithId(string value)
    {
        id = value;
        return this;
    }

    public async Task<Plan> BuildAsync()
    {
        return await planService.CreateAsync(new PlanCreateOptions()
        {
            Id = id,
            Interval = interval.ToString().ToLower(),
            Currency = currency.ToString().ToLower(),
            Amount = amountInHundreds,
            Product = new PlanProductOptions()
            {
                Name = Guid.NewGuid().ToString()
            }
        });
    }
}