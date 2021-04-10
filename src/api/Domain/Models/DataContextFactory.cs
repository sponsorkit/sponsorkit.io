using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Sponsorkit.Infrastructure;

// ReSharper disable UnusedType.Global

namespace Sponsorkit.Domain.Models
{
    public class DataContextFactory : IDesignTimeDbContextFactory<DataContext>
    {
        public DataContext CreateDbContext(string[] args)
        {
            var configuration = new ConfigurationBuilder()
                .AddJsonFile("local.settings.json")
                .Build();

            var cosmosOptions = new CosmosOptions();
            
            var values = configuration.GetSection("Values");
            values.Bind(cosmosOptions);

            return new DataContext(
                new OptionsWrapper<CosmosOptions>(cosmosOptions));
        }
    }
}