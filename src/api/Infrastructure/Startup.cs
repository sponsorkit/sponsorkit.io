using Microsoft.Azure.Functions.Extensions.DependencyInjection;
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
            builder.Services.AddOptions<CosmosOptions>();
            
            builder.Services.AddDbContext<DataContext>();
        }
    }
}