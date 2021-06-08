using System.Diagnostics;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Sponsorkit.Domain.Models;

namespace Sponsorkit.Infrastructure
{
    public class DatabaseMigrator
    {
        public static async Task MigrateDatabaseForHostAsync(IHost host)
        {
            if (Debugger.IsAttached)
                return;

            using var scope = host.Services.CreateScope();

            var dataContext = scope.ServiceProvider.GetRequiredService<DataContext>();
            await dataContext.Database.MigrateAsync();
        }
    }
}
