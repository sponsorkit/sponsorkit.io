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
using Sponsorkit.Domain.Models;

namespace Sponsorkit.Infrastructure
{
    public class Program
    {
        public static async Task Main()
        {
            var host = new HostBuilder()
                .ConfigureFunctionsWorkerDefaults(
                    (_, _) => { },
                    options => ConfigureDefaults(options))
                .ConfigureAppConfiguration((_, builder) => 
                    ConfigureConfiguration(builder).Build())
                .ConfigureServices(ConfigureServices)
                .Build();

            await host.RunAsync();
        }

        public static ObjectSerializer ConfigureDefaults(WorkerOptions options)
        {
            return options.Serializer = new JsonObjectSerializer(
                new JsonSerializerOptions()
                {
                    IgnoreNullValues = true,
                    WriteIndented = false,
                    PropertyNameCaseInsensitive = false,
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                    DictionaryKeyPolicy = JsonNamingPolicy.CamelCase
                });
        }

        public static IConfigurationBuilder ConfigureConfiguration(IConfigurationBuilder builder)
        {
            return builder
                .AddUserSecrets("sponsorkit-secrets")
                .AddJsonFile("local.settings.json", true);
        }

        public static void ConfigureServices(IServiceCollection services)
        {
            ConfigureOptions(services);
            
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

            HandleDatabaseCreationIfDebugging(services);
        }

        private static void HandleDatabaseCreationIfDebugging(IServiceCollection services)
        {
            var provider = services.BuildServiceProvider();
            var dataContext = provider.GetRequiredService<DataContext>();

            dataContext.Database.EnsureDeleted();
            dataContext.Database.Migrate();
        }

        private static void ConfigureOptions(IServiceCollection services)
        {
            AddOptions<SqlServerOptions>(services);
        }

        private static void AddOptions<TOptions>(IServiceCollection services) where TOptions: class
        {
            var name = typeof(TOptions).Name;

            services
                .AddOptions<TOptions>()
                .Configure<IConfiguration>((settings, configuration) =>
                {
                    var valuesSection = configuration.GetSection("Values");
                    var configurationSection = valuesSection.GetSection(name);
                    configurationSection.Bind(settings);
                });
        }
    }
}