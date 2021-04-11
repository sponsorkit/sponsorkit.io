using System.Threading.Tasks;
using MediatR;
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
                .ConfigureFunctionsWorkerDefaults()
                .ConfigureAppConfiguration((_, builder) => builder
                    .AddJsonFile("local.settings.json", true)
                    .Build())
                .ConfigureServices(ConfigureServices)
                .Build();

            await host.RunAsync();
        }

        private static void ConfigureServices(IServiceCollection services)
        {
            ConfigureOptions(services);

            services.AddMvcCore();
            services.AddDbContext<DataContext>();
            services.AddMediatR(typeof(Program).Assembly);
            services.AddAutoMapper(x => x.AddMaps(typeof(Program).Assembly));

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