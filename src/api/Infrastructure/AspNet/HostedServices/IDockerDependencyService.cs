using System.Threading;
using System.Threading.Tasks;

namespace Sponsorkit.Infrastructure.AspNet.HostedServices;

public interface IDockerDependencyService
{
    Task StartAsync(CancellationToken cancellationToken);
    Task StopAsync(CancellationToken cancellationToken);
}