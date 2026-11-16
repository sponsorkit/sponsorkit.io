using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Sponsorkit.Tests;

/// <summary>
/// Validates a PROTOCOL §8 storage file the way <c>schemas/storage-file.schema.json</c> (and the kit's zod
/// <c>StorageFile</c>) does: required keys and types; extra keys are allowed.
/// </summary>
internal static class StorageFileValidator
{
    private static readonly Regex DateTime = new(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$");
    private static readonly string[] ProvidersEnum = ["github", "opencollective"];

    public static List<string> Validate(JsonNode? file)
    {
        var e = new List<string>();
        if (file is not JsonObject o)
        {
            e.Add("$: not an object");
            return e;
        }
        if (Type(o["v"]) != "number" || o["v"]!.GetValue<double>() != 1) e.Add("$.v: must be 1");
        if (o.ContainsKey("sessionToken") && o["sessionToken"] is not null && !(Type(o["sessionToken"]) == "string" && o["sessionToken"]!.GetValue<string>().StartsWith("sks_")))
            e.Add("$.sessionToken: must be null or start with sks_");
        if (o["cache"] is JsonObject cache)
        {
            Result(cache["result"], "$.cache.result", e);
            Date(cache["storedAt"], "$.cache.storedAt", e, nullable: false);
        }
        else if (o["cache"] is not null) e.Add("$.cache: must be an object or null");
        if (o.ContainsKey("nags"))
        {
            if (o["nags"] is not JsonObject nags) e.Add("$.nags: must be an object");
            else
            {
                foreach (var (id, state) in nags)
                {
                    if (state is not JsonObject s) { e.Add($"$.nags.{id}: not an object"); continue; }
                    if (Type(s["runs"]) != "number" || s["runs"]!.GetValue<double>() % 1 != 0 || s["runs"]!.GetValue<double>() < 0) e.Add($"$.nags.{id}.runs: must be a non-negative integer");
                    if (!s.ContainsKey("lastShown")) e.Add($"$.nags.{id}.lastShown: required");
                    Date(s["lastShown"], $"$.nags.{id}.lastShown", e, nullable: true);
                }
            }
        }
        return e;
    }

    private static string Type(JsonNode? n) => Matcher.TypeOf(n);

    private static void Require(JsonObject o, string key, string type, string path, List<string> e, bool nullable = false)
    {
        if (!o.ContainsKey(key)) { e.Add($"{path}.{key}: required"); return; }
        var t = Type(o[key]);
        if (t == type || (nullable && t == "null")) return;
        e.Add($"{path}.{key}: expected {type}{(nullable ? " or null" : "")}, got {t}");
    }

    private static void Enum(JsonObject o, string key, string[] values, string path, List<string> e)
    {
        if (Type(o[key]) != "string" || !values.Contains(o[key]!.GetValue<string>())) e.Add($"{path}.{key}: must be one of {string.Join("|", values)}");
    }

    private static void Date(JsonNode? n, string path, List<string> e, bool nullable)
    {
        if (n is null && nullable) return;
        if (Type(n) != "string" || !DateTime.IsMatch(n!.GetValue<string>())) e.Add($"{path}: must be an ISO-8601 date-time{(nullable ? " or null" : "")}");
    }

    private static void Money(JsonNode? n, string path, List<string> e)
    {
        if (n is not JsonObject m) { e.Add($"{path}: must be money"); return; }
        if (Type(m["value"]) != "number" || m["value"]!.GetValue<double>() % 1 != 0) e.Add($"{path}.value: must be an integer");
        if (Type(m["currency"]) != "string" || !Regex.IsMatch(m["currency"]!.GetValue<string>(), "^[A-Z]{3}$")) e.Add($"{path}.currency: must be ISO 4217");
    }

    private static void Result(JsonNode? n, string path, List<string> e)
    {
        if (n is not JsonObject r) { e.Add($"{path}: must be an object"); return; }
        foreach (var k in new[] { "signedIn", "disabled", "mock", "stale", "fromCache" }) Require(r, k, "boolean", path, e);
        Require(r, "targets", "array", path, e);
        Require(r, "contributions", "array", path, e);
        Require(r, "fetchedAt", "string", path, e, nullable: true);
        Require(r, "supporter", "object", path, e, nullable: true);
        if (r["targets"] is JsonArray targets && targets.Any(t => Type(t) != "string")) e.Add($"{path}.targets: must be strings");
        if (r["supporter"] is JsonObject s)
        {
            Require(s, "id", "string", path + ".supporter", e);
            Require(s, "identities", "array", path + ".supporter", e);
            foreach (var (identity, i) in ((s["identities"] as JsonArray) ?? []).Select((x, i) => (x, i)))
            {
                var ip = $"{path}.supporter.identities[{i}]";
                if (identity is not JsonObject io) { e.Add($"{ip}: must be an object"); continue; }
                Enum(io, "provider", ProvidersEnum, ip, e);
                Require(io, "id", "string", ip, e);
                Require(io, "handle", "string", ip, e, nullable: true);
                Require(io, "needsReconnect", "boolean", ip, e);
            }
        }
        if (r.ContainsKey("unavailable") && (r["unavailable"] is not JsonArray u || u.Any(p => Type(p) != "string" || !ProvidersEnum.Contains(p!.GetValue<string>()))))
            e.Add($"{path}.unavailable: must be an array of providers");
        foreach (var (c, i) in ((r["contributions"] as JsonArray) ?? []).Select((x, i) => (x, i)))
        {
            var cp = $"{path}.contributions[{i}]";
            if (c is not JsonObject co) { e.Add($"{cp}: must be an object"); continue; }
            foreach (var k in new[] { "id", "target" }) Require(co, k, "string", cp, e);
            Enum(co, "provider", ProvidersEnum, cp, e);
            Enum(co, "via", ["direct", "organization"], cp, e);
            Enum(co, "kind", ["recurring", "one_time"], cp, e);
            Enum(co, "frequency", ["one_time", "monthly", "yearly"], cp, e);
            Enum(co, "status", ["active", "paused", "cancelled", "paid", "refunded", "disputed", "failed", "pending"], cp, e);
            Require(co, "private", "boolean", cp, e);
            Require(co, "flags", "array", cp, e);
            if (co["sponsor"] is JsonObject sp)
            {
                Enum(sp, "type", ["user", "organization"], cp + ".sponsor", e);
                Enum(sp, "provider", ProvidersEnum, cp + ".sponsor", e);
                Require(sp, "id", "string", cp + ".sponsor", e);
                Require(sp, "handle", "string", cp + ".sponsor", e, nullable: true);
            }
            else e.Add($"{cp}.sponsor: must be an object");
            Money(co["amount"], cp + ".amount", e);
            Require(co, "tier", "object", cp, e, nullable: true);
            Require(co, "totalContributed", "object", cp, e, nullable: true);
            if (co["totalContributed"] is not null) Money(co["totalContributed"], cp + ".totalContributed", e);
            foreach (var k in new[] { "startedAt", "endedAt", "lastChargedAt", "nextChargeAt" }) Require(co, k, "string", cp, e, nullable: true);
        }
    }
}
