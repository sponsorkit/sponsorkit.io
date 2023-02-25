using Stripe;

namespace Sponsorkit.BusinessLogic.Domain.Models.Stripe;

public enum PlanInterval
{
    Month
}

public enum PlanCurrency
{
    Usd
}

public class StripePlanBuilder : AsyncModelBuilder<Plan>
{
    private readonly PlanService planService;

    private PlanInterval? interval;
    private PlanCurrency? currency;
    private int? amountInHundreds;
    private string? productName;
    
    private string id;

    public StripePlanBuilder(
        PlanService planService)
    {
        this.planService = planService;
        
        id = Guid.NewGuid().ToString();
    }

    public StripePlanBuilder WithId(string id)
    {
        this.id = id;
        return this;
    }

    public StripePlanBuilder WithInterval(PlanInterval value)
    {
        interval = value;
        return this;
    }

    public StripePlanBuilder WithCurrency(PlanCurrency value)
    {
        currency = value;
        return this;
    }

    public StripePlanBuilder WithAmountInHundreds(int value)
    {
        amountInHundreds = value;
        return this;
    }

    public StripePlanBuilder WithProductName(string productName)
    {
        this.productName = productName;
        return this;
    }

    public override async Task<Plan> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (interval == null)
            throw new InvalidOperationException("Interval must be set.");

        if (currency == null)
            throw new InvalidOperationException("Currency must be set.");

        if (amountInHundreds == null)
            throw new InvalidOperationException("Amount must be set.");

        if (productName == null)
            throw new InvalidOperationException("Product name must be set.");
        
        return await planService.CreateAsync(
            new PlanCreateOptions()
            {
                Id = id,
                Interval = interval.ToString()!.ToLower(),
                Currency = currency.ToString()!.ToLower(),
                Amount = amountInHundreds,
                Product = new PlanProductOptions()
                {
                    Name = productName
                }
            },
            default,
            cancellationToken);
    }
}