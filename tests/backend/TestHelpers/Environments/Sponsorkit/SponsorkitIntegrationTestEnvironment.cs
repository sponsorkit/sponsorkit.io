using System.Threading.Tasks;

namespace Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

public class SponsorkitIntegrationTestEnvironment : IntegrationTestEnvironment<SponsorkitEnvironmentSetupOptions>
{
    protected SponsorkitIntegrationTestEnvironment(SponsorkitEnvironmentSetupOptions options = null) : base(options)
    {
        
    }

    public static async Task<SponsorkitIntegrationTestEnvironment> CreateAsync(SponsorkitEnvironmentSetupOptions options = null)
    {
        var environment = new SponsorkitIntegrationTestEnvironment(options);
        await environment.InitializeAsync();

        return environment;
    }

    protected override IIntegrationTestEntrypoint GetEntrypoint(SponsorkitEnvironmentSetupOptions options)
    {
        return new SponsorkitStartupEntrypoint(options);
    }
}