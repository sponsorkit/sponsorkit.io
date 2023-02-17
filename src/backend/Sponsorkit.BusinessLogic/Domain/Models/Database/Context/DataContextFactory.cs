using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using Sponsorkit.BusinessLogic.Infrastructure.Options;

namespace Sponsorkit.BusinessLogic.Domain.Models.Database.Context;

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