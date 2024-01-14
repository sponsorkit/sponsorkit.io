using System.Reflection;
using Sponsorkit.Jobs.Domain;

namespace Sponsorkit.Jobs.Infrastructure;

public sealed class JobsIocRegistry
{
    private IServiceCollection Services { get; }
    private IConfiguration Configuration { get; }

    public JobsIocRegistry(
        IServiceCollection services,
        IConfiguration configuration)
    {
        Services = services;
        Configuration = configuration;
    }

    public void Register()
    {
        Services.AddTransient<PayoutJob>();
        Services.AddTransient<IJob, PayoutJob>(x => x.GetRequiredService<PayoutJob>());
    }
}