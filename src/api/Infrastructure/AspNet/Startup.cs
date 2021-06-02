﻿using System;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Linq;
using System.Net.Mime;
using System.Security.Claims;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using AspNet.Security.OAuth.GitHub;
using FluffySpoon.AspNet.NGrok;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.OAuth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Sponsorkit.Infrastructure.AspNet.Health;
using Sponsorkit.Infrastructure.Ioc;
using Sponsorkit.Infrastructure.Options;

namespace Sponsorkit.Infrastructure.AspNet
{
    [ExcludeFromCodeCoverage]
    [SuppressMessage("ReSharper", "UnusedMember.Global")]
    public class Startup
    {
        public Startup(
            IConfiguration configuration,
            IHostEnvironment environment)
        {
            Configuration = configuration;
            Environment = environment;
        }

        public IConfiguration Configuration
        {
            get;
        }

        public IHostEnvironment Environment
        {
            get;
        }

        public void ConfigureServices(IServiceCollection services)
        {
            var registry = new IocRegistry(
                services,
                Configuration);
            registry.Register();

            ConfigureNGrok(services);
            ConfigureAspNetCore(services);
            ConfigureSwagger(services);
            ConfigureAuthentication(services);
        }

        private static void ConfigureNGrok(IServiceCollection services)
        {
            services.AddNGrok();
        }

        private void ConfigureAuthentication(IServiceCollection services)
        {
            var jwtOptions = Configuration.Get<JwtOptions>();
            services
                .AddAuthentication()
                .AddJwtBearer(options =>
                {
                    options.Audience = "http://localhost:5000/";
                    options.TokenValidationParameters = new TokenValidationParameters
                    {
                        ValidateIssuerSigningKey = true,
                        ValidateIssuer = true,
                        ValidIssuer = "http://localhost:5000/",
                        IssuerSigningKey = new SymmetricSecurityKey(
                            Encoding.UTF8.GetBytes(jwtOptions.JwtPrivateKey)),
                    };
                });
        }

        private static void ConfigureAspNetCore(IServiceCollection services)
        {
            services.Configure<ForwardedHeadersOptions>(options =>
            {
                options.ForwardedHeaders =
                    ForwardedHeaders.XForwardedFor |
                    ForwardedHeaders.XForwardedProto;

                options.KnownNetworks.Clear();
                options.KnownProxies.Clear();
            });

            services.AddHttpContextAccessor();

            services
                .AddMvcCore()
                .AddJsonOptions(x =>
                {
                    x.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
                })
                .AddApplicationPart(typeof(Startup).Assembly)
                .AddControllersAsServices()
                .AddAuthorization()
                .AddApiExplorer();

            services.AddHealthChecks();

            services.AddCors(options =>
            {
                options.AddDefaultPolicy(
                    builder => builder
                        .WithOrigins(Debugger.IsAttached ?
                            new [] {
                                "http://localhost:8000",
                                "http://localhost:9000"
                            } :
                            new [] { 
                                "https://sponsorkit.io"
                            })
                        .AllowAnyHeader()
                        .AllowAnyMethod());
            });

            services.AddResponseCompression(options =>
            {
                options.EnableForHttps = true;
            });
        }

        private static void ConfigureSwagger(IServiceCollection services)
        {
            services.AddSwaggerGen(c =>
            {
                c.SwaggerDoc("v1", new OpenApiInfo
                {
                    Title = "General",
                    Version = "v1"
                });

                c.TagActionsBy(x => new[] { "General" });
                
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

        public void Configure(
            IApplicationBuilder app)
        {
            app.UseForwardedHeaders();

            app.UseNGrokAutomaticUrlDetection();

            app.UseResponseCompression();

            app.UseExceptionHandler("/errors/details");

            app.UseRouting();

            app.UseCors();

            app.UseAuthentication();
            app.UseAuthorization();

            app.UseSwagger();
            app.UseSwaggerUI();

            app.UseWhen(
                IsWebhookRequest,
                webhookApp => webhookApp.Use(async (context, next) =>
                {
                    context.Request.EnableBuffering();

                    await next();
                }));

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapHealthChecks("/health", new HealthCheckOptions()
                {
                    ResponseWriter = async (context, report) =>
                    {
                        var result = JsonSerializer.Serialize(new HealthResult
                        {
                            Status = report.Status.ToString(),
                            Duration = report.TotalDuration,
                            Information = report.Entries
                                .Select(e => new HealthInformation
                                {
                                    Key = e.Key,
                                    Description = e.Value.Description,
                                    Duration = e.Value.Duration,
                                    Status = Enum.GetName(typeof(HealthStatus),
                                        e.Value.Status),
                                    Error = e.Value.Exception?.Message
                                })
                                .ToList()

                        });

                        context.Response.ContentType = MediaTypeNames.Application.Json;

                        await context.Response.WriteAsync(result);
                    }
                });

                endpoints.MapSwagger();

                endpoints
                    .MapControllers()
                    .RequireAuthorization();
            });
        }

        private static bool IsWebhookRequest(HttpContext context)
        {
            return context.Request.Path.StartsWithSegments(
                "/api/webhooks",
                StringComparison.InvariantCultureIgnoreCase);
        }
    }
}
