using System;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Reflection;
using Flurl.Http.Configuration;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Serilog;
using Sponsorkit.Domain.Api.Signup.AsBeneficiary.Encryption;
using Sponsorkit.Domain.Api.Signup.AsBeneficiary.GitHub;
using Sponsorkit.Domain.Models;
using Sponsorkit.Infrastructure.AspNet;
using Sponsorkit.Infrastructure.Options;
using Stripe;

namespace Sponsorkit.Infrastructure.Ioc
{
    public class IocRegistry
    {
        protected IServiceCollection Services { get; }
        protected IConfiguration Configuration { get; }

        public IocRegistry(
            IServiceCollection services,
            IConfiguration configuration)
        {
            this.Services = services;
            this.Configuration = configuration;
        }

        public virtual void Register()
        {
            ConfigureOptions();

            ConfigureDebugHelpers();

            ConfigureInfrastructure();

            ConfigureAutoMapper();
            ConfigureMediatr(typeof(IocRegistry).Assembly);

            ConfigureEntityFramework();

            ConfigureStripe();
            
            ConfigureHealthChecks();

            ConfigureFlurl();

            ConfigureLogging();
        }

        private void ConfigureLogging()
        {
            this.Services.AddTransient(p => Log.Logger);
        }

        private void ConfigureFlurl()
        {
            this.Services.AddSingleton<IFlurlClientFactory, PerBaseUrlFlurlClientFactory>();
        }

        private void ConfigureHealthChecks()
        {
            this.Services.AddHealthChecks();
        }

        private void ConfigureOptions()
        {
            void Configure<TOptions>() where TOptions : class
            {
                var configurationKey = Configuration.GetSectionNameFor<TOptions>();
                this.Services.Configure<TOptions>(this.Configuration.GetSection(configurationKey));
            }

            this.Services.AddOptions();

            Configure<GitHubOptions>();
            Configure<SqlOptions>();
            Configure<StripeOptions>();
            Configure<EncryptionOptions>();
        }

        private void ConfigureDebugHelpers()
        {
            var shouldConfigure =
                Debugger.IsAttached ||
                EnvironmentHelper.IsRunningInTest;
            if (!shouldConfigure)
                return;

            DockerDependencyService.InjectInto(
                this.Services);
        }

        private void ConfigureStripe()
        {
            var stripeConfiguration = Configuration.GetOptions<StripeOptions>();

            var secretKey = stripeConfiguration?.SecretKey;
            var publishableKey = stripeConfiguration?.PublishableKey;

            Services.AddSingleton<CustomerService>();
            Services.AddSingleton<PaymentMethodService>();
            Services.AddSingleton<SubscriptionService>();
            Services.AddSingleton<WebhookEndpointService>();
            Services.AddSingleton<PromotionCodeService>();
            Services.AddSingleton<CouponService>();
            Services.AddSingleton<AccountLinkService>();
            Services.AddSingleton<CustomerBalanceTransactionService>();
            Services.AddSingleton<PlanService>();
            Services.AddSingleton<ChargeService>();

            Services.AddSingleton<IStripeClient, StripeClient>(
                _ => new StripeClient(
                    apiKey: secretKey,
                    clientId: publishableKey));
        }

        [ExcludeFromCodeCoverage]
        private void ConfigureEntityFramework()
        {
            this.Services.AddDbContextPool<DataContext>(
                optionsBuilder =>
                {
                    var sqlOptions = this.Configuration.GetOptions<SqlOptions>();
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
            this.Services.AddSingleton<IAesEncryptionHelper, AesEncryptionHelper>();

            this.Services.AddLogging(builder => builder
                .SetMinimumLevel(LogLevel.Debug)
                .AddConsole());

            this.Services.AddSingleton(this.Configuration);
        }

        public void ConfigureMediatr(params Assembly[] assemblies)
        {
            this.Services.AddMediatR(x => x.AsTransient(), assemblies);
        }

        private void ConfigureAutoMapper()
        {
            this.Services.AddAutoMapper(typeof(IocRegistry).Assembly);
        }
    }
}
