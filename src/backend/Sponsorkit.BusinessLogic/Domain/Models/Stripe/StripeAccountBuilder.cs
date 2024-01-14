using Sponsorkit.BusinessLogic.Domain.Helpers;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.BusinessLogic.Domain.Models.Stripe.Metadata;
using Stripe;

namespace Sponsorkit.BusinessLogic.Domain.Models.Stripe;

public class StripeAccountBuilder : AsyncModelBuilder<Account>
{
    private readonly AccountService accountService;
    
    private string? email;
    private string? customerId;

    public StripeAccountBuilder(
        AccountService accountService)
    {
        this.accountService = accountService;
    }

    public StripeAccountBuilder WithEmail(string email)
    {
        this.email = email;
        return this;
    }

    public StripeAccountBuilder WithCustomerId(string customerId)
    {
        this.customerId = customerId;
        return this;
    }
    
    public override async Task<Account> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (customerId == null)
            throw new InvalidOperationException("Customer not set.");

        if (email == null)
            throw new InvalidOperationException("Email not set.");
        
        var account = await accountService.CreateAsync(
            new AccountCreateOptions()
            {
                Email = email,
                Type = "express"
            },
            new RequestOptions()
            {
                IdempotencyKey = $"stripe-account-{customerId}"
            },
            cancellationToken);
        return account;
    }
}

public class StripeSetupIntentBuilder : AsyncModelBuilder<SetupIntent>
{
    private readonly SetupIntentService setupIntentService;
    
    private User? user;
    private PaymentMethod? paymentMethod;
    private string? idempotencyKey;
    
    private IStripeMetadataBuilder? stripeMetadataBuilder;

    public StripeSetupIntentBuilder(
        SetupIntentService setupIntentService)
    {
        this.setupIntentService = setupIntentService;
    }

    public StripeSetupIntentBuilder WithUser(User user)
    {
        this.user = user;
        return this;
    }

    public StripeSetupIntentBuilder WithPaymentMethod(PaymentMethod? paymentMethod)
    {
        this.paymentMethod = paymentMethod;
        return this;
    }

    public StripeSetupIntentBuilder WithIdempotencyKey(string idempotencyKey)
    {
        this.idempotencyKey = idempotencyKey;
        return this;
    }

    public StripeSetupIntentBuilder WithMetadata(IStripeMetadataBuilder stripeMetadataBuilder)
    {
        this.stripeMetadataBuilder = stripeMetadataBuilder;
        return this;
    }

    public override async Task<SetupIntent> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (user == null)
            throw new InvalidOperationException("User is not set.");

        if (stripeMetadataBuilder == null)
            throw new InvalidOperationException("No metadata set.");

        if (idempotencyKey == null)
            throw new InvalidOperationException("No idempotency key set.");

        var metadata = new Dictionary<string, string>()
        {
            {
                UniversalMetadataKeys.Type, stripeMetadataBuilder.Type
            }
        };
        foreach (var metadataPair in stripeMetadataBuilder.Build())
        {
            metadata.Add(
                metadataPair.Key, 
                metadataPair.Value);
        }

        var intent = await setupIntentService.CreateAsync(
            new SetupIntentCreateOptions()
            {
                Confirm = false,
                Customer = user.StripeCustomerId,
                PaymentMethod = paymentMethod?.Id,
                Usage = "off_session",
                Metadata = metadata,
                AutomaticPaymentMethods = new SetupIntentAutomaticPaymentMethodsOptions()
                {
                    Enabled = true
                }
            },
            new RequestOptions()
            {
                IdempotencyKey = idempotencyKey
            },
            cancellationToken: cancellationToken);
        return intent;
    }
}