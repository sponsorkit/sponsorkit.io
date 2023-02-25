namespace Sponsorkit.BusinessLogic.Infrastructure.AspNet.HostedServices;

public interface IDockerDependencyService
{
    Task StartAsync(CancellationToken cancellationToken);
    Task StopAsync(CancellationToken cancellationToken);
}