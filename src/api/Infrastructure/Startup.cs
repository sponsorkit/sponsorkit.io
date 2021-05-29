using System;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Tasks;
using AspNet.Security.OAuth.GitHub;
using Azure.Core.Serialization;
using MediatR;
using Microsoft.AspNetCore.Authentication.OAuth;
using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Sponsorkit.Domain.Api.Signup.SignupAsBeneficiaryPost.Encryption;
using Sponsorkit.Domain.Models;
using Sponsorkit.Infrastructure.Options;
using Stripe;

namespace Sponsorkit.Infrastructure
{
    public class Program
    {
        public static async Task Main()
        {
            var host = new HostBuilder()
                .ConfigureFunctionsWorkerDefaults(
                    (_, _) => { },
                    ConfigureDefaults)
                .ConfigureAppConfiguration((_, builder) => 
                    ConfigureConfiguration(builder)
                        .AddUserSecrets("sponsorkit-secrets")
                        .Build())
                .ConfigureServices((context, services) => ConfigureServices(services, context.Configuration))
                .Build();

            await host.RunAsync();
        }

        public static void ConfigureDefaults(WorkerOptions options)
        {
            options.Serializer = new JsonObjectSerializer(
                new JsonSerializerOptions()
                {
                    IgnoreNullValues = true,
                    WriteIndented = false,
                    PropertyNameCaseInsensitive = false,
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                    DictionaryKeyPolicy = JsonNamingPolicy.CamelCase
                });
        }

        public static IConfigurationBuilder ConfigureConfiguration(IConfigurationBuilder configurationBuilder)
        {
            return configurationBuilder
                .AddJsonFile("local.settings.json", true);
        }

        public static void ConfigureServices(
            IServiceCollection services,
            IConfiguration configuration)
        {
            ConfigureOptions(services);
            ConfigureStripe(services, configuration);
            
            services.AddDbContext<DataContext>();
            services.AddMediatR(typeof(Program).Assembly);
            services.AddAutoMapper(x => x.AddMaps(typeof(Program).Assembly));
            services
                .AddAuthentication()
                .AddGitHub(GitHubAuthenticationDefaults.AuthenticationScheme, options =>
                {
                    //TODO: add secrets and stuff.
                    options.ClientId = "TODO";
                    options.ClientSecret = "TODO";
                    
                    options.Scope.Add("user:email");
                    options.Events = new OAuthEvents()
                    {
                        OnCreatingTicket = async context =>
                        {
                            var email = context.Identity.FindFirst(ClaimTypes.Email)?.Value;
                            if (email == null)
                                throw new InvalidOperationException("E-mail was not sent by GitHub.");

                            var userId = context.User.GetProperty("id").GetString();
                            if (userId == null)
                                throw new InvalidOperationException("User ID was not sent by GitHub.");

                            throw new NotImplementedException("Not implemented!");
                        }
                    };
                });
        }

        private static void ConfigureStripe(
            IServiceCollection services,
            IConfiguration configuration)
        {
            var stripeConfiguration = configuration.GetOptions<StripeOptions>();

            var secretKey = stripeConfiguration?.SecretKey;
            var publishableKey = stripeConfiguration?.PublishableKey;

            services.AddSingleton<CustomerService>();
            services.AddSingleton<PaymentMethodService>();
            services.AddSingleton<SubscriptionService>();
            services.AddSingleton<WebhookEndpointService>();
            services.AddSingleton<PromotionCodeService>();
            services.AddSingleton<CouponService>();
            services.AddSingleton<CustomerBalanceTransactionService>();
            services.AddSingleton<PlanService>();

            services.AddSingleton<IStripeClient, StripeClient>(
                _ => new StripeClient(
                    apiKey: secretKey,
                    clientId: publishableKey));
        }

        private static void ConfigureOptions(IServiceCollection services)
        {
            AddOptions<SqlOptions>(services);
            AddOptions<EncryptionOptions>(services);
            AddOptions<StripeOptions>(services);
        }

        private static void AddOptions<TOptions>(IServiceCollection services) where TOptions: class
        {
            services
                .AddOptions<TOptions>()
                .Configure<IConfiguration>((settings, configuration) =>
                {
                    var configurationSection = configuration.GetNestedConfigurationSection<TOptions>();
                    configurationSection.Bind(settings);
                });
        }
    }
}