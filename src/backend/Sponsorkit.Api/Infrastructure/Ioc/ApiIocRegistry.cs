using System;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using FluffySpoon.Ngrok;
using FluffySpoon.Ngrok.AspNet;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.OpenApi.Models;
using Sponsorkit.Api.Infrastructure.AspNet;
using Sponsorkit.BusinessLogic.Infrastructure.Ioc;
using Sponsorkit.BusinessLogic.Infrastructure.Options;
using Sponsorkit.BusinessLogic.Infrastructure.Security.Jwt;

namespace Sponsorkit.Api.Infrastructure.Ioc;

public sealed class ApiIocRegistry
{
    private readonly Assembly[] assemblies;
    
    private IServiceCollection Services { get; }
    private IConfiguration Configuration { get; }
    private IHostEnvironment Environment { get; }

    public ApiIocRegistry(
        IServiceCollection services,
        IConfiguration configuration, 
        IHostEnvironment environment,
        Assembly[] assemblies)
    {
        this.assemblies = assemblies;
        
        Services = services;
        Configuration = configuration;
        Environment = environment;
    }

    public void Register()
    {
        var businessLogicRegistry = new BusinessLogicIocRegistry(
            Services, 
            Configuration,
            assemblies);
        businessLogicRegistry.Register();

        if (Environment.IsDevelopment())
        {
            ConfigureNGrok();
        }

        ConfigureAspNetCore();
        ConfigureSwagger();
        ConfigureAuthentication();
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

    private void ConfigureNGrok()
    {
        Services.AddNgrokHostedService();
        Services.AddSingleton<INgrokLifetimeHook, StripeWebhookNgrokLifetimeHook>();
    }
    
    private void ConfigureAspNetCore()
    {
        Services.AddAWSLambdaHosting(LambdaEventSource.HttpApi);
        
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
            .AddApplicationPart(typeof(ApiStartup).Assembly)
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