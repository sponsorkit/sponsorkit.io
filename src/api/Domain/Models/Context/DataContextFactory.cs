using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using Sponsorkit.Infrastructure.Options;

namespace Sponsorkit.Domain.Models.Context
{
    public class DataContextFactory : IDesignTimeDbContextFactory<DataContext>
    {
        public DataContext CreateDbContext(string[] args)
        {
            var configuration = new ConfigurationBuilder()
                .AddJsonFile("appsettings.json", false)
                .AddJsonFile("appsettings.Development.json", false)
                .Build();
            var options = configuration.GetOptions<SqlOptions>();

            return new DataContext(
                new DbContextOptionsBuilder<DataContext>()
                    .UseNpgsql(options.ConnectionString)
                    .Options);
        }
    }
}