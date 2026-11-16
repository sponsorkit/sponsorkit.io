using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Sponsorkit.Tests;

/// <summary>
/// Port of <c>sdks/conformance/src/matcher.ts</c>: the scenarios.json matcher language (README §3.5) and request
/// expectations (§3.6). "Missing" (JS <c>undefined</c>) is modelled with a separate <c>present</c> flag.
/// </summary>
internal static class Matcher
{
    private static readonly Regex IsoDateTime = new(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$");

    /// <summary>Replaces <c>$NAME</c> variables in every string, longest names first.</summary>
    public static JsonNode? Substitute(JsonNode? value, IReadOnlyDictionary<string, string> vars)
    {
        var names = vars.Keys.OrderByDescending(k => k.Length).ToList();
        JsonNode? Walk(JsonNode? v)
        {
            switch (v)
            {
                case JsonObject o:
                    var obj = new JsonObject();
                    foreach (var kv in o) obj[kv.Key] = Walk(kv.Value);
                    return obj;
                case JsonArray a:
                    var arr = new JsonArray();
                    foreach (var item in a) arr.Add(Walk(item));
                    return arr;
                case JsonValue s when s.GetValueKind() == JsonValueKind.String:
                    var str = s.GetValue<string>();
                    foreach (var n in names) str = str.Replace(n, vars[n], StringComparison.Ordinal);
                    return JsonValue.Create(str);
                case null:
                    return null;
                default:
                    return v.DeepClone();
            }
        }
        return Walk(value);
    }

    public static string TypeOf(JsonNode? v, bool present = true)
    {
        if (!present) return "undefined";
        return v switch
        {
            null => "null",
            JsonArray => "array",
            JsonObject => "object",
            JsonValue x => x.GetValueKind() switch
            {
                JsonValueKind.String => "string",
                JsonValueKind.Number => "number",
                JsonValueKind.True or JsonValueKind.False => "boolean",
                JsonValueKind.Null => "null",
                _ => "unknown",
            },
            _ => "unknown",
        };
    }

    private static double Number(JsonNode v) => double.Parse(v.ToJsonString(), CultureInfo.InvariantCulture);

    private static string Show(JsonNode? v, bool present = true) => present ? (v?.ToJsonString() ?? "null") : "undefined";

    private static bool ScalarEquals(JsonNode? a, JsonNode? b)
    {
        var ta = TypeOf(a);
        if (ta != TypeOf(b)) return false;
        return ta switch
        {
            "null" => true,
            "number" => Number(a!) == Number(b!),
            "string" => a!.GetValue<string>() == b!.GetValue<string>(),
            "boolean" => a!.GetValue<bool>() == b!.GetValue<bool>(),
            _ => false,
        };
    }

    public static bool DeepEqual(JsonNode? a, JsonNode? b)
    {
        if (TypeOf(a) != TypeOf(b)) return false;
        if (a is JsonArray aa)
        {
            var ba = (JsonArray)b!;
            return aa.Count == ba.Count && aa.Select((x, i) => DeepEqual(x, ba[i])).All(ok => ok);
        }
        if (a is JsonObject ao)
        {
            var bo = (JsonObject)b!;
            return ao.Count == bo.Count && ao.All(kv => bo.ContainsKey(kv.Key) && DeepEqual(kv.Value, bo[kv.Key]));
        }
        return ScalarEquals(a, b);
    }

    private static bool IsOperator(JsonNode? m) => m is JsonObject o && o.Any(kv => kv.Key.StartsWith('$'));

    public static List<string> Match(JsonNode? actual, JsonNode? expected, string path = "$", bool present = true)
    {
        var errors = new List<string>();
        if (IsOperator(expected))
        {
            foreach (var (op, arg) in (JsonObject)expected!)
            {
                switch (op)
                {
                    case "$exact":
                        if (!present || !DeepEqual(actual, arg)) errors.Add($"{path}: expected exactly {Show(arg)}, got {Show(actual, present)}");
                        break;
                    case "$regex":
                        if (!present || TypeOf(actual) != "string" || !Regex.IsMatch(actual!.GetValue<string>(), arg!.GetValue<string>()))
                            errors.Add($"{path}: {Show(actual, present)} does not match /{arg}/");
                        break;
                    case "$absent":
                        if (arg!.GetValue<bool>() && present && actual is not null) errors.Add($"{path}: expected absent or null, got {Show(actual)}");
                        break;
                    case "$any":
                        if (arg!.GetValue<bool>() && !present) errors.Add($"{path}: expected a value");
                        break;
                    case "$type":
                        {
                            var want = arg!.GetValue<string>();
                            var t = TypeOf(actual, present);
                            var ok = want switch
                            {
                                "datetime" => t == "string" && IsoDateTime.IsMatch(actual!.GetValue<string>()),
                                "integer" => t == "number" && Math.Abs(Number(actual!) % 1) == 0,
                                _ => t == want,
                            };
                            if (!ok) errors.Add($"{path}: expected type {want}, got {Show(actual, present)}");
                            break;
                        }
                    case "$len":
                        {
                            int? len = TypeOf(actual, present) switch
                            {
                                "array" => ((JsonArray)actual!).Count,
                                "string" => actual!.GetValue<string>().Length,
                                _ => null,
                            };
                            if (len != (int)Number(arg!)) errors.Add($"{path}: expected length {arg}, got {len}");
                            break;
                        }
                    case "$oneOf":
                        if (!((JsonArray)arg!).Any(o => Match(actual, o, path, present).Count == 0))
                            errors.Add($"{path}: {Show(actual, present)} matches none of {Show(arg)}");
                        break;
                    case "$url":
                        {
                            var spec = (JsonObject)arg!;
                            if (TypeOf(actual, present) != "string" || !Uri.TryCreate(actual!.GetValue<string>(), UriKind.Absolute, out var u))
                            {
                                errors.Add($"{path}: {Show(actual, present)} is not a URL");
                                break;
                            }
                            var @base = u.GetLeftPart(UriPartial.Authority) + u.AbsolutePath;
                            var wantBase = spec["base"]!.GetValue<string>();
                            if (@base != wantBase) errors.Add($"{path}: URL base {@base} !== {wantBase}");
                            if (spec.ContainsKey("query")) errors.AddRange(Match(ParseQuery(u.Query), spec["query"], path + "?"));
                            break;
                        }
                    case "$keys":
                        {
                            var keys = actual is JsonObject ao ? ao.Select(kv => kv.Key).OrderBy(k => k, StringComparer.Ordinal).ToList() : [];
                            var want = ((JsonArray)arg!).Select(k => k!.GetValue<string>()).OrderBy(k => k, StringComparer.Ordinal).ToList();
                            if (!keys.SequenceEqual(want)) errors.Add($"{path}: keys [{string.Join(",", keys)}] !== [{string.Join(",", want)}]");
                            break;
                        }
                    default:
                        errors.Add($"{path}: unknown operator {op}");
                        break;
                }
            }
            return errors;
        }
        if (expected is JsonArray ea)
        {
            if (!present || actual is not JsonArray aa) return [$"{path}: expected an array, got {Show(actual, present)}"];
            if (aa.Count != ea.Count) return [$"{path}: expected {ea.Count} items, got {aa.Count}"];
            for (var i = 0; i < ea.Count; i++) errors.AddRange(Match(aa[i], ea[i], $"{path}[{i}]"));
            return errors;
        }
        if (expected is JsonObject eo)
        {
            if (!present || actual is not JsonObject ao) return [$"{path}: expected an object, got {Show(actual, present)}"];
            foreach (var (k, e) in eo) errors.AddRange(Match(ao.TryGetPropertyValue(k, out var v) ? v : null, e, $"{path}.{k}", ao.ContainsKey(k)));
            return errors;
        }
        return present && ScalarEquals(actual, expected) ? errors : [$"{path}: expected {Show(expected)}, got {Show(actual, present)}"];
    }

    public static JsonObject ParseQuery(string query)
    {
        var obj = new JsonObject();
        foreach (var part in query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var eq = part.IndexOf('=');
            var key = Uri.UnescapeDataString((eq >= 0 ? part[..eq] : part).Replace('+', ' '));
            var value = eq >= 0 ? Uri.UnescapeDataString(part[(eq + 1)..].Replace('+', ' ')) : "";
            obj[key] = value;
        }
        return obj;
    }

    /// <summary>Port of matchRequests (README §3.6).</summary>
    public static List<string> MatchRequests(JsonArray log, JsonObject spec)
    {
        var exact = spec["exact"]?.GetValue<bool>() ?? true;
        var includeTargets = spec["includeTargetsLookups"]?.GetValue<bool>() ?? false;
        var relevant = log.Select(r => (JsonObject)r!)
            .Where(r => includeTargets || !(r["method"]!.GetValue<string>() == "GET" && r["path"]!.GetValue<string>() == "/api/v1/targets"))
            .ToList();
        var errors = new List<string>();
        var matched = new HashSet<int>();
        foreach (var callNode in (JsonArray?)spec["calls"] ?? [])
        {
            var call = (JsonObject)callNode!;
            var method = call["method"]!.GetValue<string>();
            var path = call["path"]!.GetValue<string>();
            var n = 0;
            for (var i = 0; i < relevant.Count; i++)
            {
                var r = relevant[i];
                if (r["method"]!.GetValue<string>() != method || r["path"]!.GetValue<string>() != path) continue;
                var ok = (!call.ContainsKey("query") || Match(r["query"], call["query"]).Count == 0)
                    && (!call.ContainsKey("headers") || Match(r["headers"], call["headers"]).Count == 0)
                    && (!call.ContainsKey("body") || Match(r["body"], call["body"], "$", r.ContainsKey("body")).Count == 0);
                if (!ok) continue;
                matched.Add(i);
                n++;
            }
            var label = $"{method} {path}";
            int? count = call["count"]?.GetValue<int>(), min = call["min"]?.GetValue<int>(), max = call["max"]?.GetValue<int>();
            if (count is not null && n != count) errors.Add($"{label}: expected {count} matching request(s), got {n}");
            if (min is not null && n < min) errors.Add($"{label}: expected at least {min}, got {n}");
            if (max is not null && n > max) errors.Add($"{label}: expected at most {max}, got {n}");
            if (count is null && min is null && max is null && n < 1) errors.Add($"{label}: expected at least 1, got 0");
        }
        if (exact)
        {
            for (var i = 0; i < relevant.Count; i++)
            {
                if (!matched.Contains(i))
                    errors.Add($"unexpected request {relevant[i]["method"]} {relevant[i]["path"]}?{relevant[i]["query"]?.ToJsonString()}");
            }
        }
        return errors;
    }
}
