using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Reflection;
using Amazon;
using Amazon.Extensions.NETCore.Setup;
using Amazon.SimpleEmailV2;
using Flurl.Http.Configuration;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Octokit.Internal;
using Serilog;
using Sponsorkit.BusinessLogic.Domain.Mediatr.Behaviors;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Builders;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Sponsorkit.BusinessLogic.Domain.Models.Stripe;
using Sponsorkit.BusinessLogic.Domain.Stripe;
using Sponsorkit.BusinessLogic.Domain.Stripe.Handlers;
using Sponsorkit.BusinessLogic.Domain.Stripe.Handlers.PaymentIntentSucceeded;
using Sponsorkit.BusinessLogic.Domain.Stripe.Handlers.SetupIntentSucceeded;
using Sponsorkit.BusinessLogic.Infrastructure.AspNet.HostedServices;
using Sponsorkit.BusinessLogic.Infrastructure.GitHub;
using Sponsorkit.BusinessLogic.Infrastructure.Options;
using Sponsorkit.BusinessLogic.Infrastructure.Options.GitHub;
using Sponsorkit.BusinessLogic.Infrastructure.Security.Encryption;
using Sponsorkit.BusinessLogic.Infrastructure.Security.Jwt;
using Stripe;

namespace Sponsorkit.BusinessLogic.Infrastructure.Ioc;

public sealed class BusinessLogicIocRegistry
{
    private readonly Assembly[] assemblies;
    
    private IServiceCollection Services { get; }
    private IConfiguration Configuration { get; }

    public BusinessLogicIocRegistry(IServiceCollection services,
        IConfiguration configuration, 
        Assembly[] assemblies)
    {
        this.assemblies = assemblies;
        
        Services = services;
        Configuration = configuration;
    }

    public void Register()
    {
        ConfigureOptions();
        ConfigureDebugHelpers();
        ConfigureInfrastructure();
        ConfigureAutoMapper();
        ConfigureMediatr();
        ConfigureGitHub();
        ConfigureEntityFramework();
        ConfigureStripe();
        ConfigureHealthChecks();
        ConfigureFlurl();
        ConfigureLogging();
        ConfigureAws();
    }

    private void ConfigureDebugHelpers()
    {
        var shouldConfigure =
            Debugger.IsAttached ||
            EnvironmentHelper.IsRunningInTest;
        if (!shouldConfigure)
            return;

        DockerDependencyService.InjectInto(
            Services);
    }

    private void ConfigureGitHub()
    {
        Services.AddScoped(serviceProvider => serviceProvider
            .GetRequiredService<IGitHubClientFactory>()
            .CreateClientFromOAuthAuthenticationToken(null));
            
        Services.AddScoped(serviceProvider => serviceProvider
            .GetRequiredService<IGitHubClientFactory>()
            .CreateGraphQlClientFromOAuthAuthenticationToken(null));
            
        Services.AddScoped<IGitHubClientFactory, GitHubClientFactory>();
        Services.AddSingleton(_ =>
        {
            var adapter = new HttpClientAdapter(HttpMessageHandlerFactory.CreateDefault);
            adapter.SetRequestTimeout(TimeSpan.FromSeconds(5));

            return adapter;
        });
        Services.AddHttpClient<IGitHubClientFactory, GitHubClientFactory>();
    }

    private void ConfigureAws()
    {
        Services.AddAWSService<IAmazonSimpleEmailServiceV2>();
            
        Services.AddDefaultAWSOptions(
            new AWSOptions()
            {
                Region = RegionEndpoint.EUNorth1,
                Profile = Debugger.IsAttached ? 
                    "sponsorkit" :
                    null,
                    
            });
    }

    private void ConfigureLogging()
    {
        Services.AddTransient(_ => Log.Logger);
    }

    private void ConfigureFlurl()
    {
        Services.AddSingleton<IFlurlClientCache>(_ => new FlurlClientCache());
    }

    private void ConfigureHealthChecks()
    {
        Services
            .AddHealthChecks()
            .AddDbContextCheck<DataContext>();
    }

    private void ConfigureOptions()
    {
        void Configure<TOptions>() where TOptions : class
        {
            var configurationKey = Configuration.GetSectionNameFor<TOptions>();
            Services.Configure<TOptions>(Configuration.GetSection(configurationKey));
        }

        Services.AddOptions();

        Configure<GitHubOptions>();
        Configure<SqlOptions>();
        Configure<StripeOptions>();
        Configure<EncryptionOptions>();
        Configure<JwtOptions>();
    }

    private void ConfigureStripe()
    {
        var stripeConfiguration = Configuration.GetOptions<StripeOptions>();

        var secretKey = stripeConfiguration.SecretKey;
        if (secretKey == null)
            throw new InvalidOperationException("Stripe secret key is not set.");

        var publishableKey = stripeConfiguration.PublishableKey;
        if (publishableKey == null)
            throw new InvalidOperationException("Stripe publishable key is not set.");

        Services.AddSingleton<SetupIntentService>();
        Services.AddSingleton<AccountService>();
        Services.AddSingleton<CustomerService>();
        Services.AddSingleton<PaymentMethodService>();
        Services.AddSingleton<SubscriptionService>();
        Services.AddSingleton<WebhookEndpointService>();
        Services.AddSingleton<PromotionCodeService>();
        Services.AddSingleton<CouponService>();
        Services.AddSingleton<AccountLinkService>();
        Services.AddSingleton<CustomerBalanceTransactionService>();
        Services.AddSingleton<PlanService>();
        Services.AddSingleton<BalanceService>();
        Services.AddSingleton<ApplicationFeeService>();
        Services.AddSingleton<ChargeService>();
        Services.AddSingleton<PaymentIntentService>();

        Services.AddTransient<StripeAccountBuilder>();
        Services.AddTransient<StripeCustomerBuilder>();
        Services.AddTransient<StripeSetupIntentBuilder>();
        Services.AddTransient<StripePlanBuilder>();
        Services.AddTransient<StripeSubscriptionBuilder>();
        Services.AddTransient<StripePaymentMethodBuilder>();

        RegisterStripeEventHandler<SetupIntentSucceededEventHandler, SetupIntent>();
        RegisterStripeEventHandler<BountySetupIntentSucceededEventHandler, SetupIntent>();
        RegisterStripeEventHandler<BountyPaymentIntentSucceededEventHandler, PaymentIntent>();

        Services.AddSingleton<IStripeClient, StripeClient>(
            _ => new StripeClient(
                apiKey: secretKey,
                clientId: publishableKey));

        Services.AddTransient<IEventFactory, EventFactory>();

        void RegisterStripeEventHandler<TEventHandler, TData>()  
            where TData : class
            where TEventHandler : StripeEventHandler<TData>, IStripeEventHandler
        {
            Services.AddScoped<IStripeEventHandler, TEventHandler>();
            Services.AddScoped<StripeEventHandler<TData>, TEventHandler>();
        }
    }

    [ExcludeFromCodeCoverage]
    private void ConfigureEntityFramework()
    {
        Services.AddTransient<UserBuilder>();
        
        Services.AddDbContextPool<DataContext>(
            optionsBuilder =>
            {
                var sqlOptions = Configuration.GetOptions<SqlOptions>();
                var connectionString = sqlOptions.ConnectionString;

                optionsBuilder.UseNpgsql(
                    connectionString,
                    options => options
                        .EnableRetryOnFailure(
                            3, 
                            TimeSpan.FromSeconds(1), 
                            Array.Empty<string>()));
            },
            1);
    }

    private void ConfigureInfrastructure()
    {
        Services.AddSingleton<IEncryptionHelper, AesEncryptionHelper>();
        Services.AddSingleton<ITokenFactory, TokenFactory>();

        Services.AddLogging(builder => builder
            .SetMinimumLevel(LogLevel.Debug)
            .AddConsole());

        Services.AddSingleton(Configuration);
    }

    private void ConfigureMediatr()
    {
        Services.AddMediatR(x =>
        {
            x.AddOpenBehavior(typeof(DatabaseTransactionBehavior<,>), ServiceLifetime.Scoped);
            x.Lifetime = ServiceLifetime.Transient;
            x.RegisterServicesFromAssemblies(assemblies);
        });
    }

    private void ConfigureAutoMapper()
    {
        Services.AddAutoMapper(typeof(BusinessLogicIocRegistry).Assembly);
    }

}