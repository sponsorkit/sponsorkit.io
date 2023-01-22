using System;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon;
using Amazon.Extensions.NETCore.Setup;
using Amazon.SimpleEmailV2;
using FluffySpoon.Ngrok;
using FluffySpoon.Ngrok.AspNet;
using Flurl.Http.Configuration;
using MediatR;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.OpenApi.Models;
using Octokit.Internal;
using Serilog;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers.PaymentIntentSucceeded;
using Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers.SetupIntentSucceeded;
using Sponsorkit.Domain.Mediatr.Behaviors.Database;
using Sponsorkit.Domain.Models.Database.Builders;
using Sponsorkit.Domain.Models.Database.Context;
using Sponsorkit.Domain.Models.Stripe;
using Sponsorkit.Infrastructure.AspNet.HostedServices;
using Sponsorkit.Infrastructure.GitHub;
using Sponsorkit.Infrastructure.Options;
using Sponsorkit.Infrastructure.Options.GitHub;
using Sponsorkit.Infrastructure.Security.Encryption;
using Sponsorkit.Infrastructure.Security.Jwt;
using Stripe;
using GraphQLConnection = Octokit.GraphQL.Connection;
using GraphQLIConnection = Octokit.GraphQL.IConnection;
using GraphQLInMemoryCredentialStore = Octokit.GraphQL.Internal.InMemoryCredentialStore;

namespace Sponsorkit.Infrastructure.Ioc;

public sealed class IocRegistry
{
    private IServiceCollection Services { get; }
    private IConfiguration Configuration { get; }
    private IHostEnvironment Environment { get; }

    public IocRegistry(IServiceCollection services,
        IConfiguration configuration, 
        IHostEnvironment environment)
    {
        Services = services;
        Configuration = configuration;
        Environment = environment;
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
        ConfigureAws();
        ConfigureHostedServices();
        ConfigureNGrok();
        ConfigureAspNetCore();
        ConfigureSwagger();
        ConfigureAuthentication();
    }

    private void ConfigureHostedServices()
    {
        Services.AddScoped<PayoutHostedService>();
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

        Services.AddAWSLambdaHosting(LambdaEventSource.HttpApi);
            
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
        Services.AddSingleton<IFlurlClientFactory, PerBaseUrlFlurlClientFactory>();
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

    public void ConfigureMediatr(params Assembly[] assemblies)
    {
        Services.AddMediatR(x => x.AsTransient(), assemblies);
            
        Services.AddScoped(typeof(IPipelineBehavior<,>), typeof(DatabaseTransactionBehavior<,>));
    }

    private void ConfigureAutoMapper()
    {
        Services.AddAutoMapper(typeof(IocRegistry).Assembly);
    }

    private void ConfigureNGrok()
    {
        Services.AddNgrokHostedService();
        Services.AddSingleton<INgrokLifetimeHook, StripeWebhookNgrokLifetimeHook>();
    }

    private void ConfigureAuthentication()
    {
        var jwtOptions = Configuration.GetOptions<JwtOptions>();
        Services
            .AddAuthorization()
            .AddAuthentication(options =>
            {
                options.DefaultScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(options =>
            {
                options.Audience = "sponsorkit.io";
                options.TokenValidationParameters = JwtValidator.GetValidationParameters(
                    jwtOptions, 
                    TimeSpan.FromMinutes(15));
                options.Events = new JwtBearerEvents()
                {
                    OnChallenge = async (context) =>
                    {
                        context.HandleResponse();
                            
                        if (context.AuthenticateFailure != null)
                        {
                            context.Response.StatusCode = 401;
                            await context.HttpContext.Response.WriteAsync("{}");
                        }
                    }
                };
            });
    }

    private void ConfigureAspNetCore()
    {
        Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders =
                ForwardedHeaders.XForwardedFor |
                ForwardedHeaders.XForwardedProto;

            options.KnownNetworks.Clear();
            options.KnownProxies.Clear();
        });

        Services.AddHttpContextAccessor();

        Services
            .AddMvcCore()
            .AddJsonOptions(x =>
            {
                x.JsonSerializerOptions.Converters.Add(
                    new JsonStringEnumConverter(
                        JsonNamingPolicy.CamelCase));
            })
            .AddApplicationPart(typeof(Program).Assembly)
            .AddControllersAsServices()
            .AddAuthorization()
            .AddApiExplorer();

        Services.AddCors(options =>
        {
            options.AddDefaultPolicy(
                builder => builder
                    .SetIsOriginAllowedToAllowWildcardSubdomains()
                    .WithOrigins(Environment.EnvironmentName switch
                    {
                        "Development" => new []
                        {
                            "http://localhost:3000", 
                            "http://localhost:9000", 
                            "http://localhost:6006"
                        },
                        "Staging" => new [] {
                            "https://*.vercel.app"
                        },
                        "Production" => new []
                        {
                            "https://sponsorkit.io"
                        },
                        _ => throw new InvalidOperationException("Environment not recognized.")
                    })
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials());
        });

        Services.AddResponseCompression(options => { options.EnableForHttps = true; });
    }

    private void ConfigureSwagger()
    {
        Services.AddSwaggerGen(c =>
        {
            c.SchemaFilter<AutoRestOpenApiFilter>();
            c.DocumentFilter<AutoRestOpenApiFilter>();
            c.OperationFilter<AutoRestOpenApiFilter>();
            c.ParameterFilter<AutoRestOpenApiFilter>();
            c.RequestBodyFilter<AutoRestOpenApiFilter>();

            c.SwaggerDoc("v1", new OpenApiInfo
            {
                Title = "General",
                Version = "v1"
            });

            c.TagActionsBy(_ => new[]
            {
                "General"
            });

            c.IgnoreObsoleteActions();
            c.IgnoreObsoleteProperties();

            c.SupportNonNullableReferenceTypes();

            c.DescribeAllParametersInCamelCase();
            c.CustomOperationIds(x =>
            {
                var httpMethod = x.HttpMethod?.ToString() ?? "GET";
                var httpMethodPascalCase = httpMethod[0..1].ToUpperInvariant() + httpMethod[1..].ToLowerInvariant();
                return x.RelativePath + httpMethodPascalCase;
            });
            c.CustomSchemaIds(x => x.FullName);
        });
    }
}