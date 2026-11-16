using System.Linq;
using System.Threading.Tasks;

[assembly: CollectionBehavior(DisableTestParallelization = true)]

namespace Sponsorkit.Tests;

/// <summary>
/// One test per scenario in <c>sdks/conformance/scenarios.json</c>, run sequentially against the shared fake server.
/// </summary>
public sealed class ConformanceTests(ConformanceServer server) : IClassFixture<ConformanceServer>
{
    public static TheoryData<string> ScenarioIds
    {
        get
        {
            var data = new TheoryData<string>();
            foreach (var s in ScenarioRunner.Scenarios) data.Add(s["id"]!.GetValue<string>());
            return data;
        }
    }

    [Theory]
    [MemberData(nameof(ScenarioIds))]
    public Task Scenario(string id) => ScenarioRunner.RunAsync(server, id);

    [Fact]
    public void Every_scenario_is_covered()
    {
        var ids = ScenarioRunner.Scenarios.Select(s => s["id"]!.GetValue<string>()).ToList();
        Assert.Equal(ids.Count, ids.Distinct().Count());
        Assert.True(ids.Count >= 55, $"expected at least 55 scenarios, found {ids.Count}");
    }
}
