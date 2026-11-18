using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Sponsorkit.Internal;

namespace Sponsorkit.Tests;

/// <summary>Mock presets are embedded identically and expanded per the rules in fixtures/mock-presets.json.</summary>
public sealed class MockPresetTests
{
    [Fact]
    public void Embedded_presets_are_byte_identical_to_the_conformance_fixture() =>
        Assert.Equal(File.ReadAllText(Paths.Fixture("mock-presets.json")), MockPresets.RawJson);

    [Fact]
    public void Preset_names_match_the_fixture()
    {
        var presets = (JsonObject)JsonNode.Parse(MockPresets.RawJson)!["presets"]!;
        Assert.Equal(presets.Select(kv => kv.Key).OrderBy(x => x), SponsorkitMock.PresetNames.OrderBy(x => x));
    }

    private static SponsorkitClient Client(SponsorkitMock mock, string? github = "octocat", string? oc = "my-collective", Dictionary<string, string>? env = null) =>
        new(new SponsorkitOptions { GitHub = github, OpenCollective = oc, Mock = mock, Environment = env ?? new Dictionary<string, string>(), StorageDirectory = "/nonexistent/should-not-be-touched" });

    [Theory]
    [InlineData("active-monthly", "con_github_mock_active_monthly", "active")]
    [InlineData("one-time", "con_github_mock_one_time", "paid")]
    [InlineData("cancelled", "con_github_mock_cancelled", "cancelled")]
    [InlineData("org", "con_github_mock_org", "active")]
    public async Task Presets_expand_with_the_first_target(string preset, string id, string status)
    {
        var fc = await Client(preset).GetFinancialContributionAsync();
        Assert.True(fc.Mock);
        Assert.True(fc.SignedIn);
        Assert.Null(fc.FetchedAt);
        Assert.Null(fc.Unavailable);
        Assert.Equal(["github:octocat", "opencollective:my-collective"], fc.Targets);
        Assert.Equal("sup_mock", fc.Supporter!.Id);
        Assert.Equal("github", fc.Supporter.Identities.Single().Provider);
        var c = Assert.Single(fc.Contributions);
        Assert.Equal(id, c.Id);
        Assert.Equal("github:octocat", c.Target);
        Assert.Equal(status, c.Status);
    }

    [Fact]
    public async Task Opencollective_only_uses_its_target()
    {
        var fc = await Client("active-monthly", github: null).GetFinancialContributionAsync();
        Assert.Equal("con_opencollective_mock_active_monthly", fc.Contributions.Single().Id);
        Assert.Equal("opencollective:my-collective", fc.Contributions.Single().Target);
    }

    [Fact]
    public async Task Signed_out_and_none()
    {
        var signedOut = await Client("signed-out").GetFinancialContributionAsync();
        Assert.False(signedOut.SignedIn);
        Assert.Null(signedOut.Supporter);
        var none = await Client("none").GetFinancialContributionAsync();
        Assert.True(none.SignedIn);
        Assert.Empty(none.Contributions);
    }

    [Fact]
    public async Task Helpers_filter_without_aggregating()
    {
        var fc = await Client("org").GetFinancialContributionAsync();
        Assert.Single(fc.Active());
        Assert.Single(fc.Recurring());
        Assert.Empty(fc.OneTime());
        Assert.Empty(fc.Direct());
        Assert.Single(fc.ByProvider(Providers.GitHub));
        Assert.Empty(fc.ByProvider(Providers.OpenCollective));
    }

    [Fact]
    public async Task Checkout_simulates_a_contribution()
    {
        var sk = Client("signed-out");
        var r = await sk.OpenCheckoutAsync(new CheckoutOptions { Provider = "opencollective", Amount = 1000, Currency = "EUR", Frequency = Frequencies.Yearly });
        Assert.Equal(CheckoutStatus.Contributed, r.Status);
        Assert.Equal("con_opencollective_mock_checkout", r.Contribution!.Id);
        Assert.Equal("yearly", r.Contribution.Frequency);
        Assert.Equal("recurring", r.Contribution.Kind);
        Assert.Equal("active", r.Contribution.Status);
        Assert.Equal(1000, r.Contribution.Amount.Value);
        Assert.True(sk.IsSignedIn());
        var again = await sk.OpenCheckoutAsync();
        Assert.Equal("con_github_mock_checkout", again.Contribution!.Id);
        Assert.Equal(500, again.Contribution.Amount.Value);
        Assert.Equal("USD", again.Contribution.Amount.Currency);
        Assert.Equal(2, (await sk.GetFinancialContributionAsync()).Contributions.Count);
    }

    [Fact]
    public void Unknown_presets_are_configuration_errors()
    {
        Assert.Equal(SponsorkitErrorCodes.InvalidConfig, Assert.Throws<SponsorkitError>(() => Client("platinum")).Code);
        Assert.Equal(SponsorkitErrorCodes.InvalidConfig,
            Assert.Throws<SponsorkitError>(() => new SponsorkitClient(new SponsorkitOptions { GitHub = "x", Environment = new Dictionary<string, string> { ["SPONSORKIT_MOCK"] = "gold" } })).Code);
    }

    [Fact]
    public async Task Mock_nags_live_in_memory()
    {
        var sk = Client("none");
        var nag = sk.Nag(new NagOptions("mock-nag") { Every = 1 });
        Assert.True(await nag.DueAsync(fc => fc.Active().Count == 0, force: true));
        nag.Shown();
        Assert.False(Directory.Exists("/nonexistent/should-not-be-touched"));
    }

    [Fact]
    public async Task Disabled_beats_mock_and_rejects_actions()
    {
        var sk = Client("active-monthly", env: new Dictionary<string, string> { ["SPONSORKIT_DISABLE"] = "TRUE" });
        var fc = await sk.GetFinancialContributionAsync();
        Assert.True(fc.Disabled);
        Assert.False(fc.Mock);
        Assert.Equal(SponsorkitErrorCodes.Disabled, (await Assert.ThrowsAsync<SponsorkitError>(() => sk.SignInAsync())).Code);
        Assert.Equal(SponsorkitErrorCodes.Disabled, (await Assert.ThrowsAsync<SponsorkitError>(() => sk.OpenCheckoutAsync())).Code);
        Assert.False(await sk.Nag(new NagOptions("x") { Every = 1 }).DueAsync(_ => true, force: true));
    }

    [Theory]
    [InlineData("0", false)]
    [InlineData("false", false)]
    [InlineData("FALSE", false)]
    [InlineData("", false)]
    [InlineData("1", true)]
    [InlineData("yes", true)]
    public void Environment_variables_count_as_set_unless_empty_0_or_false(string value, bool disabled) =>
        Assert.Equal(disabled, Client("none", env: new Dictionary<string, string> { ["SPONSORKIT_DISABLE"] = value }).IsDisabled);

    [Fact]
    public void Nag_durations_parse_iso8601()
    {
        Assert.Equal(System.TimeSpan.FromDays(7), NagOptions.ParseDuration("P7D"));
        Assert.Equal(System.TimeSpan.FromSeconds(2), NagOptions.ParseDuration("PT2S"));
        Assert.Equal(SponsorkitErrorCodes.InvalidConfig, Assert.Throws<SponsorkitError>(() => NagOptions.ParseDuration("7 days")).Code);
    }

    [Fact]
    public void Checkout_url_is_offline_and_validates_provider()
    {
        var sk = Client("none");
        Assert.Equal("https://sponsorkit.github.io/sponsorkit.io/checkout/?targets=github%3Aoctocat%2Copencollective%3Amy-collective&frequency=monthly",
            sk.CheckoutUrl(new CheckoutUrlOptions { Frequency = Frequencies.Monthly }));
        Assert.Equal(SponsorkitErrorCodes.InvalidConfig, Assert.Throws<SponsorkitError>(() => Client("none", oc: null).CheckoutUrl(new CheckoutUrlOptions { Provider = "opencollective" })).Code);
    }
}
