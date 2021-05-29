using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Sponsorkit.Infrastructure;
using Sponsorkit.Infrastructure.Options;

namespace Sponsorkit.Domain.Models
{
    public class DataContextFactory : IDesignTimeDbContextFactory<DataContext>
    {
        public DataContext CreateDbContext(string[] args)
        {
            var configuration = new ConfigurationBuilder()
                .AddJsonFile("local.settings.json", false)
                .Build();

            return new DataContext(configuration);
        }
    }
}