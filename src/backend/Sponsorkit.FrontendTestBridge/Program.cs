using System.Runtime.CompilerServices;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

// ReSharper disable AccessToDisposedClosure

[assembly: InternalsVisibleTo("Sponsorkit.Tests")]

var builder = WebApplication.CreateBuilder();

const int port = 14569;
builder.WebHost.ConfigureKestrel(options => options.ListenLocalhost(port));

var app = builder.Build();

await using var testBridge = new TestBridge();
await testBridge.CreateNewEnvironmentAsync();

app.MapPost("/tests/environment", async () =>
{
    await testBridge.CreateNewEnvironmentAsync();
    return Results.Ok(new CreateTestEnvironmentResponse(port));
});

await app.RunAsync();

public class TestBridge : IAsyncDisposable
{
    private SponsorkitIntegrationTestEnvironment? environment;
    
    public async Task CreateNewEnvironmentAsync()
    {
        if (environment != null)
        {
            await environment.DisposeAsync();
        }
        
        environment = await SponsorkitIntegrationTestEnvironment.CreateAsync(new SponsorkitEnvironmentSetupOptions()
        {
            Port = 5000
        });
    }

    public async ValueTask DisposeAsync()
    {
        if(environment != null)
            await environment.DisposeAsync();

        environment = null;
    }
}

record CreateTestEnvironmentResponse(int Port);