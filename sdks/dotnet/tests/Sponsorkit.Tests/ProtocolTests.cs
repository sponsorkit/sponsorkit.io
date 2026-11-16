using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using Sponsorkit.Internal;

namespace Sponsorkit.Tests;

/// <summary>Test vectors from <c>sdks/conformance/fixtures/vectors.json</c> (PROTOCOL §1, §2).</summary>
public sealed class ProtocolTests
{
    private static readonly JsonObject Vectors = (JsonObject)JsonNode.Parse(File.ReadAllText(Paths.Fixture("vectors.json")))!;

    public static TheoryData<string> TargetSetVectors()
    {
        var data = new TheoryData<string>();
        foreach (var v in (JsonArray)Vectors["targetSets"]!) data.Add(v!.ToJsonString());
        return data;
    }

    [Theory]
    [MemberData(nameof(TargetSetVectors))]
    public void Targets_hash_and_param_match_the_vectors(string vector)
    {
        var v = JsonNode.Parse(vector)!;
        var input = v["input"]!;
        var set = TargetSet.FromOptions(input["github"]?.GetValue<string>(), input["opencollective"]?.GetValue<string>());
        Assert.Equal(v["param"]!.GetValue<string>(), set.Param);
        Assert.Equal(v["targetsHash"]!.GetValue<string>(), set.Hash);

        var client = new SponsorkitClient(new SponsorkitOptions
        {
            GitHub = input["github"]?.GetValue<string>(),
            OpenCollective = input["opencollective"]?.GetValue<string>(),
            Environment = new System.Collections.Generic.Dictionary<string, string> { ["SPONSORKIT_DISABLE"] = "1" },
        });
        Assert.Equal(v["targetsHash"]!.GetValue<string>(), client.TargetsHash);
        Assert.Equal(v["param"]!.GetValue<string>().Split(','), client.Targets);
    }

    public static TheoryData<string, string> InvalidTargetVectors()
    {
        var data = new TheoryData<string, string>();
        foreach (var v in (JsonArray)Vectors["invalidTargets"]!) data.Add(v!["provider"]!.GetValue<string>(), v["account"]!.GetValue<string>());
        return data;
    }

    [Theory]
    [MemberData(nameof(InvalidTargetVectors))]
    public void Invalid_targets_are_rejected(string provider, string account)
    {
        var e = Assert.Throws<SponsorkitError>(() => TargetSet.Normalize(provider, account));
        Assert.Equal(SponsorkitErrorCodes.InvalidConfig, e.Code);
    }

    public static TheoryData<string, string> PkceVectors()
    {
        var data = new TheoryData<string, string>();
        foreach (var v in (JsonArray)Vectors["pkce"]!) data.Add(v!["codeVerifier"]!.GetValue<string>(), v["codeChallenge"]!.GetValue<string>());
        return data;
    }

    [Theory]
    [MemberData(nameof(PkceVectors))]
    public void Pkce_challenge_matches_the_vectors(string verifier, string challenge) => Assert.Equal(challenge, Pkce.Challenge(verifier));

    [Fact]
    public void Pkce_verifier_is_43_base64url_characters()
    {
        var verifier = Pkce.CreateVerifier();
        Assert.Matches("^[A-Za-z0-9_-]{43}$", verifier);
        Assert.NotEqual(verifier, Pkce.CreateVerifier());
        Assert.Matches("^[A-Za-z0-9_-]{43}$", Pkce.Challenge(verifier));
    }

    [Fact]
    public void Github_only_hash_matches_the_conformance_kit() =>
        Assert.Equal("d3831f8e6aefc8e048f18374a230b28dd9e05310c396cdab5b75b6dcce9228f9", TargetSet.FromOptions("sponsorkit-conformance", null).Hash);

    [Fact]
    public void At_most_one_target_per_provider_and_at_least_one()
    {
        Assert.Equal(SponsorkitErrorCodes.InvalidConfig, Assert.Throws<SponsorkitError>(() => TargetSet.FromOptions(null, null)).Code);
        Assert.Equal(SponsorkitErrorCodes.InvalidConfig, Assert.Throws<SponsorkitError>(() => TargetSet.FromOptions("", " ")).Code);
    }

    [Theory]
    [InlineData("2026-03-01T10:00:00Z", "2026-03-01T10:00:00Z")]
    [InlineData("2026-11-16T18:00:00.000Z", "2026-11-16T18:00:00Z")]
    [InlineData("2026-11-16T18:00:00.120Z", "2026-11-16T18:00:00.12Z")]
    [InlineData("2026-11-16T20:00:00+02:00", "2026-11-16T18:00:00Z")]
    public void Timestamps_round_trip_as_utc(string input, string output) => Assert.Equal(output, Iso.Format(Iso.Parse(input)));

    [Fact]
    public void Contributions_round_trip_through_the_models()
    {
        var fixture = (JsonObject)JsonNode.Parse(File.ReadAllText(Paths.Fixture("contributions.json")))!;
        foreach (var (name, c) in (JsonObject)fixture["contributions"]!)
        {
            var model = c.Deserialize<Contribution>()!;
            var back = JsonSerializer.SerializeToNode(model);
            Assert.True(Matcher.DeepEqual(c, back), $"{name}: {back!.ToJsonString()}");
        }
    }

    [Fact]
    public void Contribution_results_round_trip_and_omit_unavailable_when_null()
    {
        foreach (var name in new[] { "contribution-result.json", "contribution-result.partial.json", "contribution-result.signed-out.json", "contribution-result.disabled.json" })
        {
            var json = JsonNode.Parse(File.ReadAllText(Paths.Fixture(name)))!;
            var model = json.Deserialize<ContributionResult>()!;
            var back = JsonSerializer.SerializeToNode(model)!;
            var problems = Matcher.Match(back, json, name).Where(p => !p.Contains("fetchedAt", StringComparison.Ordinal)).ToList();
            Assert.True(problems.Count == 0, string.Join("\n", problems));
            Assert.Equal(json["unavailable"] is not null, back.AsObject().ContainsKey("unavailable"));
        }
    }

    [Fact]
    public void Storage_file_fixture_is_valid_and_readable()
    {
        var json = File.ReadAllText(Paths.Fixture("storage-file.json"));
        Assert.Empty(StorageFileValidator.Validate(JsonNode.Parse(json)));
        var file = SponsorkitJson.Deserialize<StorageFile>(json)!;
        Assert.StartsWith("sks_", file.SessionToken);
        Assert.NotNull(file.Cache?.Result);
        Assert.Empty(StorageFileValidator.Validate(JsonNode.Parse(SponsorkitJson.Serialize(file))));
    }
}
