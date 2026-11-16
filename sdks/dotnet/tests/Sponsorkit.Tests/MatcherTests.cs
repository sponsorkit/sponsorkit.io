using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;

namespace Sponsorkit.Tests;

/// <summary>The ported matcher must reject what the reference matcher rejects, or the conformance suite proves nothing.</summary>
public sealed class MatcherTests
{
    private static List<string> M(string actual, string expected) => Matcher.Match(JsonNode.Parse(actual), JsonNode.Parse(expected));

    [Theory]
    [InlineData("""{"a":1,"b":2}""", """{"a":1}""")]
    [InlineData("""{"a":null}""", """{"a":{"$absent":true}}""")]
    [InlineData("""{}""", """{"a":{"$absent":true}}""")]
    [InlineData("""{"a":null}""", """{"a":{"$any":true}}""")]
    [InlineData("""{"a":[1,2]}""", """{"a":{"$len":2}}""")]
    [InlineData("""{"a":"2026-01-01T00:00:00.5Z"}""", """{"a":{"$type":"datetime"}}""")]
    [InlineData("""{"a":3}""", """{"a":{"$type":"integer"}}""")]
    [InlineData("""{"a":"sks_x"}""", """{"a":{"$regex":"^sks_"}}""")]
    [InlineData("""{"a":1}""", """{"a":{"$oneOf":[2,1]}}""")]
    [InlineData("""{"a":1,"b":null}""", """{"$keys":["a","b"]}""")]
    [InlineData("""{"a":1,"b":[{"c":null}]}""", """{"$exact":{"b":[{"c":null}],"a":1.0}}""")]
    [InlineData("\"http://h:1/checkout?targets=github%3Ax&amount=5\"", """{"$url":{"base":"http://h:1/checkout","query":{"$exact":{"targets":"github:x","amount":"5"}}}}""")]
    public void Matches(string actual, string expected) => Assert.Empty(M(actual, expected));

    [Theory]
    [InlineData("""{"a":2}""", """{"a":1}""")]
    [InlineData("""{}""", """{"a":null}""")]
    [InlineData("""{"a":1}""", """{"a":{"$absent":true}}""")]
    [InlineData("""{}""", """{"a":{"$any":true}}""")]
    [InlineData("""{"a":[1]}""", """{"a":[1,2]}""")]
    [InlineData("""{"a":"x"}""", """{"a":{"$type":"datetime"}}""")]
    [InlineData("""{"a":1.5}""", """{"a":{"$type":"integer"}}""")]
    [InlineData("""{"a":1,"b":2}""", """{"$exact":{"a":1}}""")]
    [InlineData("""{"a":1,"b":null}""", """{"$exact":{"a":1}}""")]
    [InlineData("""{"a":1}""", """{"$keys":["a","b"]}""")]
    [InlineData("\"http://h:1/checkout?targets=x&challenge=y\"", """{"$url":{"base":"http://h:1/checkout","query":{"$exact":{"targets":"x"}}}}""")]
    [InlineData("\"http://h:2/checkout\"", """{"$url":{"base":"http://h:1/checkout"}}""")]
    public void Rejects(string actual, string expected) => Assert.NotEmpty(M(actual, expected));

    [Fact]
    public void Request_expectations_count_and_reject_unexpected_requests()
    {
        var log = (JsonArray)JsonNode.Parse("""
            [{"method":"GET","path":"/api/v1/contributions","query":{},"headers":{"authorization":"Bearer sks_1"}},
             {"method":"GET","path":"/api/v1/targets","query":{"github":"x"},"headers":{}}]
            """)!;
        Assert.Empty(Matcher.MatchRequests(log, (JsonObject)JsonNode.Parse("""{"calls":[{"method":"GET","path":"/api/v1/contributions","count":1,"headers":{"authorization":"Bearer sks_1"}}]}""")!));
        Assert.NotEmpty(Matcher.MatchRequests(log, (JsonObject)JsonNode.Parse("""{"includeTargetsLookups":true,"calls":[{"method":"GET","path":"/api/v1/contributions"}]}""")!));
        Assert.NotEmpty(Matcher.MatchRequests(log, (JsonObject)JsonNode.Parse("""{"calls":[{"method":"GET","path":"/api/v1/contributions","count":2}]}""")!));
        Assert.NotEmpty(Matcher.MatchRequests(log, (JsonObject)JsonNode.Parse("""{"calls":[]}""")!));
        Assert.Empty(Matcher.MatchRequests(log, (JsonObject)JsonNode.Parse("""{"exact":false,"calls":[]}""")!));
    }

    [Fact]
    public void Substitution_prefers_longer_names()
    {
        var vars = new Dictionary<string, string> { ["$STORAGE_DIR"] = "/d", ["$STORAGE_FILE"] = "/d/f.json" };
        Assert.Equal("/d/f.json /d", Matcher.Substitute(JsonValue.Create("$STORAGE_FILE $STORAGE_DIR"), vars)!.GetValue<string>());
        Assert.Equal(["/d"], ((JsonArray)Matcher.Substitute(JsonNode.Parse("""["$STORAGE_DIR"]"""), vars)!).Select(x => x!.GetValue<string>()));
    }
}
