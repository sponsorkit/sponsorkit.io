using Microsoft.Azure.Functions.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Sponsorkit.Domain.Models;

[assembly: FunctionsStartup(typeof(Sponsorkit.Infrastructure.Startup))]

namespace Sponsorkit.Infrastructure
{
    public class Startup : FunctionsStartup
    {
        public override void Configure(IFunctionsHostBuilder builder)
        {
            AddOptions<CosmosOptions>(builder);
            
            builder.Services.AddDbContext<DataContext>();
        }
        
        private static void AddOptions<TOptions>(IFunctionsHostBuilder builder) where TOptions: class
        {
            var name = typeof(TOptions).Name;

            builder.Services
                .AddOptions<TOptions>()
                .Configure<IConfiguration>((settings, configuration) =>
                {
                    configuration
                        .GetSection(name)
                        .Bind(settings);
                });
        }
    }
}