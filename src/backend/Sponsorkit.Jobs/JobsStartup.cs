using Amazon.Lambda.Core;
using Microsoft.Extensions.Hosting.Internal;
using Sponsorkit.BusinessLogic.Infrastructure;
using Sponsorkit.BusinessLogic.Infrastructure.Ioc;
using Sponsorkit.Jobs.Domain;

namespace Sponsorkit.Jobs;

public record JobRequest(string Job);

public static class JobsStartup
{
    public static async Task Handler(JobRequest jobRequest, ILambdaContext context)
    {
        var services = new ServiceCollection();
        services.AddTransient<IJob, PayoutJob>();

        var configurationBuilder = new ConfigurationBuilder();
        ConfigurationFactory.Configure(
            configurationBuilder,
            Array.Empty<string>(),
            "sponsorkit-secrets");
    
        var registry = new BusinessLogicIocRegistry(
            services,
            configurationBuilder.Build(),
            new HostingEnvironment(),
            new []
            {
                typeof(Program).Assembly,
                typeof(BusinessLogicIocRegistry).Assembly
            });
        registry.Register();

        await using var serviceProvider = services.BuildServiceProvider();

        var jobs = serviceProvider.GetRequiredService<IEnumerable<IJob>>();
        var relevantJob = jobs.Single(x => x.Identifier == jobRequest.Job);

        var cancellationTokenSource = new CancellationTokenSource(context.RemainingTime - TimeSpan.FromMinutes(3));
        await relevantJob.ExecuteAsync(cancellationTokenSource.Token);
    }
}