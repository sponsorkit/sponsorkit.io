using System;
using System.Threading.Tasks;

namespace Sponsorkit.Tests.TestHelpers.Environments;

public interface IIntegrationTestEntrypoint : IAsyncDisposable
{
    public IServiceProvider ScopeProvider { get; }

    Task WaitUntilReadyAsync();
    
    Task OnBackgroundEndpointErrorAsync(Exception exception);
}