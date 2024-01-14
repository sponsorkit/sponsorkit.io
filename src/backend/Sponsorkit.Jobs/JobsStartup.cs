using Amazon.Lambda.Core;
using Sponsorkit.BusinessLogic.Infrastructure;
using Sponsorkit.BusinessLogic.Infrastructure.Ioc;
using Sponsorkit.Jobs.Domain;
using Sponsorkit.Jobs.Infrastructure;

namespace Sponsorkit.Jobs;

public record JobRequest(string Job);

public static class JobsStartup
{
    public static async Task Handler(JobRequest jobRequest, ILambdaContext context)
    {
        var services = new ServiceCollection();

        var configurationBuilder = new ConfigurationBuilder();
        ConfigurationFactory.Configure(
            configurationBuilder,
            Array.Empty<string>(),
            "sponsorkit-secrets");

        var configuration = configurationBuilder.Build();

        var jobsRegistry = new JobsIocRegistry(
            services,
            configuration);
        jobsRegistry.Register();
    
        var businessLogicRegistry = new BusinessLogicIocRegistry(
            services,
            configuration,
            [
                typeof(Program).Assembly,
                typeof(BusinessLogicIocRegistry).Assembly
            ]);
        businessLogicRegistry.Register();

        await using var serviceProvider = services.BuildServiceProvider();

        var jobs = serviceProvider.GetRequiredService<IEnumerable<IJob>>();
        var relevantJob = jobs.Single(x => x.Identifier == jobRequest.Job);

        var cancellationTokenSource = new CancellationTokenSource(context.RemainingTime - TimeSpan.FromMinutes(3));
        await relevantJob.ExecuteAsync(cancellationTokenSource.Token);
    }
}