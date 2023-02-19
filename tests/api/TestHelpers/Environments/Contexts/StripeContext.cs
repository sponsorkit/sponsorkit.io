using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Amazon.SimpleEmailV2;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Serilog;
using Sponsorkit.BusinessLogic.Domain.Models.Stripe;
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
    private readonly ILogger logger;

    private readonly HashSet<Event> stripeEvents;

    public StripeSubscriptionBuilder SubscriptionBuilder => 
        new(serviceProvider.GetRequiredService<SubscriptionService>());
    
    public StripePlanBuilder PlanBuilder => 
        new(serviceProvider.GetRequiredService<PlanService>());
    
    public ApplicationFeeService ApplicationFeeService => serviceProvider.GetRequiredService<ApplicationFeeService>();
    
    public BalanceService BalanceService => serviceProvider.GetRequiredService<BalanceService>();
    
    public PaymentIntentService PaymentIntentService => serviceProvider.GetRequiredService<PaymentIntentService>();
    
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
        IServiceProvider serviceProvider,
        ILogger logger)
    {
        this.serviceProvider = serviceProvider;
        this.logger = logger;

        stripeEvents = new HashSet<Event>();
    }

    public async Task WaitForWebhookAsync(Func<Event, bool> predicate)
    {
        var cancellationTokenSource = new CancellationTokenSource(TimeSpan.FromSeconds(30));

        try
        {
            while (!cancellationTokenSource.IsCancellationRequested)
            {
                if (stripeEvents.Any(predicate))
                    return;

                await Task.Delay(100, cancellationTokenSource.Token);
            }
        }
        catch (TaskCanceledException ex)
        {
            logger.Warning(ex, "Waiting for webhook timed out.");
            //ignored.
        }
    }

    public async Task OnStripeWebhookEventAsync(Event stripeEvent)
    {
        stripeEvents.Add(stripeEvent);
    }
}