using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Sponsorkit.Internal;

/// <summary>
/// The SPEC §7.4 mock presets, embedded byte-for-byte from the conformance kit's <c>fixtures/mock-presets.json</c>
/// and expanded with the rules listed in that file.
/// </summary>
internal static class MockPresets
{
    private static readonly Lazy<JsonObject> Data = new(Load);

    /// <summary>The embedded JSON text, exactly as shipped by the conformance kit.</summary>
    public static string RawJson
    {
        get
        {
            using var stream = typeof(MockPresets).Assembly.GetManifestResourceStream("Sponsorkit.MockPresets.json")
                ?? throw new InvalidOperationException("The embedded mock presets are missing.");
            using var reader = new StreamReader(stream);
            return reader.ReadToEnd();
        }
    }

    private static JsonObject Load() => (JsonObject)JsonNode.Parse(RawJson)!;

    public static bool IsPreset(string name) => Data.Value["presets"]!.AsObject().ContainsKey(name);

    private static JsonNode? Expand(JsonNode? node, Target first)
    {
        switch (node)
        {
            case JsonObject o:
                var obj = new JsonObject();
                foreach (var kv in o) obj[kv.Key] = Expand(kv.Value, first);
                return obj;
            case JsonArray a:
                var arr = new JsonArray();
                foreach (var item in a) arr.Add(Expand(item, first));
                return arr;
            case JsonValue v when v.GetValueKind() == JsonValueKind.String:
                return JsonValue.Create(v.GetValue<string>().Replace("{provider}", first.Provider).Replace("{target}", first.ToString()));
            case null:
                return null;
            default:
                return node.DeepClone();
        }
    }

    private static T Materialize<T>(JsonNode? node) =>
        node.Deserialize<T>(SponsorkitJson.Options) ?? throw new InvalidOperationException("Invalid mock preset data.");

    public static Supporter Supporter(TargetSet targets) => Materialize<Supporter>(Expand(Data.Value["supporter"], targets.First));

    /// <summary>The expanded result for a preset or custom contributions.</summary>
    public static ContributionResult Result(TargetSet targets, SponsorkitMock mock)
    {
        var first = targets.First;
        bool signedIn;
        IReadOnlyList<Contribution> contributions;
        if (mock.PresetName is { } name)
        {
            var preset = Data.Value["presets"]![name]!.AsObject();
            signedIn = preset["signedIn"]!.GetValue<bool>();
            contributions = preset["contributions"]!.AsArray().Select(c => Materialize<Contribution>(Expand(c, first))).ToList();
        }
        else
        {
            signedIn = true;
            contributions = mock.Contributions!.ToList();
        }
        return Build(targets, signedIn, contributions);
    }

    public static ContributionResult Build(TargetSet targets, bool signedIn, IReadOnlyList<Contribution> contributions) => new()
    {
        SignedIn = signedIn,
        Disabled = false,
        Mock = true,
        Targets = targets.Strings.ToList(),
        Supporter = signedIn ? Supporter(targets) : null,
        Contributions = signedIn ? contributions.ToList() : new List<Contribution>(),
        FetchedAt = null,
        Stale = false,
        FromCache = false,
    };

    /// <summary>The contribution <c>OpenCheckoutAsync</c> simulates in mock mode.</summary>
    public static Contribution CheckoutContribution(TargetSet targets, CheckoutUrlOptions opts)
    {
        var first = targets.Targets.FirstOrDefault(t => t.Provider == opts.Provider);
        if (first.Provider is null) first = targets.First;
        var c = Materialize<Contribution>(Expand(Data.Value["checkout"], first));
        var frequency = opts.Frequency ?? Frequencies.Monthly;
        var oneTime = frequency == Frequencies.OneTime;
        c.Amount = new Money { Value = opts.Amount ?? 500, Currency = opts.Currency ?? "USD" };
        c.Frequency = frequency;
        c.Kind = oneTime ? ContributionKinds.OneTime : ContributionKinds.Recurring;
        c.Status = oneTime ? ContributionStatuses.Paid : ContributionStatuses.Active;
        return c;
    }
}
