using System;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Linq;
using System.Reflection;
using Flurl.Http.Configuration;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Octokit;
using Serilog;
using Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.Encryption;
using Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.GitHub;
using Sponsorkit.Domain.Models;
using Sponsorkit.Infrastructure.AspNet;
using Sponsorkit.Infrastructure.Options;
using Sponsorkit.Infrastructure.Options.GitHub;
using Stripe;

namespace Sponsorkit.Infrastructure.Ioc
{
    public sealed class IocRegistry
    {
        private IServiceCollection Services { get; }
        private IConfiguration Configuration { get; }

        public IocRegistry(
            IServiceCollection services,
            IConfiguration configuration)
        {
            Services = services;
            Configuration = configuration;
        }

        public void Register()
        {
            ConfigureOptions();

            ConfigureDebugHelpers();

            ConfigureInfrastructure();

            ConfigureAutoMapper();
            ConfigureMediatr(typeof(IocRegistry).Assembly);

            ConfigureGitHub();
            ConfigureEntityFramework();

            ConfigureStripe();
            
            ConfigureHealthChecks();

            ConfigureFlurl();

            ConfigureLogging();
        }

        private void ConfigureGitHub()
        {
            Services.AddScoped<IGitHubClient>(c => 
                new GitHubClient(
                    GitHubClientFactory.GetProductHeaderValue()));
            Services.AddScoped<IGitHubClientFactory, GitHubClientFactory>();
        }

        private void ConfigureLogging()
        {
            Services.AddTransient(p => Log.Logger);
        }

        private void ConfigureFlurl()
        {
            Services.AddSingleton<IFlurlClientFactory, PerBaseUrlFlurlClientFactory>();
        }

        private void ConfigureHealthChecks()
        {
            Services.AddHealthChecks();
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

        private void ConfigureStripe()
        {
            var stripeConfiguration = Configuration.GetOptions<StripeOptions>();

            var secretKey = stripeConfiguration?.SecretKey;
            var publishableKey = stripeConfiguration?.PublishableKey;

            Services.AddSingleton<CustomerService>();
            Services.AddSingleton<AccountService>();
            Services.AddSingleton<PaymentMethodService>();
            Services.AddSingleton<SubscriptionService>();
            Services.AddSingleton<WebhookEndpointService>();
            Services.AddSingleton<PromotionCodeService>();
            Services.AddSingleton<CouponService>();
            Services.AddSingleton<AccountLinkService>();
            Services.AddSingleton<CustomerBalanceTransactionService>();
            Services.AddSingleton<PlanService>();
            Services.AddSingleton<ChargeService>();
            Services.AddSingleton<SetupIntentService>();

            Services.AddSingleton<IStripeClient, StripeClient>(
                _ => new StripeClient(
                    apiKey: secretKey,
                    clientId: publishableKey));
        }

        [ExcludeFromCodeCoverage]
        private void ConfigureEntityFramework()
        {
            Services.AddDbContextPool<DataContext>(
                optionsBuilder =>
                {
                    var sqlOptions = Configuration.Get<SqlOptions>();
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
            Services.AddSingleton<IAesEncryptionHelper, AesEncryptionHelper>();

            Services.AddLogging(builder => builder
                .SetMinimumLevel(LogLevel.Debug)
                .AddConsole());

            Services.AddSingleton(Configuration);
        }

        public void ConfigureMediatr(params Assembly[] assemblies)
        {
            Services.AddMediatR(x => x.AsTransient(), assemblies);
        }

        private void ConfigureAutoMapper()
        {
            Services.AddAutoMapper(typeof(IocRegistry).Assembly);
        }
    }
}
