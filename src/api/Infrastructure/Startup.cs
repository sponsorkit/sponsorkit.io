using MediatR;
using Microsoft.Azure.Functions.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Sponsorkit.Domain.Models;

[assembly: FunctionsStartup(typeof(Sponsorkit.Infrastructure.Startup))]

namespace Sponsorkit.Infrastructure
{
    public class Startup : FunctionsStartup
    {
        public override void Configure(IFunctionsHostBuilder builder)
        {
            Configure(builder.Services);
        }

        private static void Configure(IServiceCollection services)
        {
            ConfigureOptions(services);
            
            services.AddDbContext<DataContext>();
            services.AddMediatR(typeof(Startup).Assembly);
            services.AddAutoMapper(x => x.AddMaps(typeof(Startup).Assembly));

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
                    configuration
                        .GetSection(name)
                        .Bind(settings);
                });
        }
    }
}