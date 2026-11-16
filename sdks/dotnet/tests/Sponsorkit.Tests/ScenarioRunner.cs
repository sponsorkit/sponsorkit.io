using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Sponsorkit.Tests;

/// <summary>
/// Executes one scenario of <c>sdks/conformance/scenarios.json</c> against the .NET SDK. This is a port of the
/// kit's reference runner (<c>src/runner.ts</c>); see the kit's README §3.
/// </summary>
internal sealed class ScenarioRunner
{
    private static readonly Lazy<JsonObject> File = new(() =>
        (JsonObject)JsonNode.Parse(System.IO.File.ReadAllText(Path.Combine(Paths.ConformanceDir, "scenarios.json")))!);

    private static readonly HttpClient Browser = new(new HttpClientHandler { AllowAutoRedirect = true, MaxAutomaticRedirections = 20 })
    {
        Timeout = TimeSpan.FromSeconds(60),
    };

    private readonly ConformanceServer _server;
    private readonly JsonObject _scenario;
    private readonly Dictionary<string, string> _static = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _constants;
    private string? _minted;
    private JsonObject? _config;
    private SponsorkitClient? _instance;

    private ScenarioRunner(ConformanceServer server, JsonObject scenario)
    {
        _server = server;
        _scenario = scenario;
        _constants = ((JsonObject)File.Value["variables"]!)
            .Where(kv => !kv.Value!.GetValue<string>().StartsWith("runtime:", StringComparison.Ordinal))
            .ToDictionary(kv => kv.Key, kv => kv.Value!.GetValue<string>(), StringComparer.Ordinal);
    }

    public static IEnumerable<JsonObject> Scenarios => ((JsonArray)File.Value["scenarios"]!).Select(s => (JsonObject)s!);

    public static JsonObject Scenario(string id) => Scenarios.Single(s => s["id"]!.GetValue<string>() == id);

    public static Task RunAsync(ConformanceServer server, string id) => new ScenarioRunner(server, Scenario(id)).RunAsync();

    private string Id => _scenario["id"]!.GetValue<string>();

    // ------------------------------------------------------------------ variables

    private async Task<Dictionary<string, string>> RuntimeVarsAsync()
    {
        var state = await _server.CallAsync(HttpMethod.Get, "/__control");
        var vars = new Dictionary<string, string>(_static, StringComparer.Ordinal)
        {
            ["$NOW"] = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture),
        };
        if (state["lastSessionToken"] is JsonValue last) vars["$LAST_SESSION_TOKEN"] = last.GetValue<string>();
        var issued = (JsonArray)state["issuedSessionTokens"]!;
        for (var i = 0; i < issued.Count; i++) vars[$"$SESSION_TOKEN_{i + 1}"] = issued[i]!.GetValue<string>();
        if (_minted is not null) vars["$MINTED_SESSION_TOKEN"] = _minted;
        return vars;
    }

    private async Task<JsonNode?> ResolveAsync(JsonNode? value)
    {
        var v = Matcher.Substitute(Matcher.Substitute(value, _constants), _constants);
        return Matcher.Substitute(v, await RuntimeVarsAsync());
    }

    // ------------------------------------------------------------------ defaults (schemas/scenarios.schema.json)

    private static JsonObject WithDefaults(JsonObject step)
    {
        var s = (JsonObject)step.DeepClone();
        var action = s["action"]!.GetValue<string>();
        if (action == "parallel")
        {
            var args = (JsonObject)s["args"]!;
            args["step"] = WithDefaults((JsonObject)args["step"]!);
            return s;
        }
        if (action == "group")
        {
            s["steps"] = new JsonArray(((JsonArray)s["steps"]!).Select(x => (JsonNode)WithDefaults((JsonObject)x!)).ToArray());
            return s;
        }
        if (s["args"] is not JsonObject a)
        {
            a = new JsonObject();
            if (action is not ("restart" or "isSignedIn" or "signOut")) s["args"] = a;
        }
        void Default(string key, JsonNode value)
        {
            if (!a.ContainsKey(key)) a[key] = value;
        }
        switch (action)
        {
            case "configure":
                Default("apiBaseUrl", "$BASE_URL");
                Default("storageDir", "$STORAGE_DIR");
                Default("env", new JsonObject());
                Default("devChecks", false);
                break;
            case "nagDue":
                Default("force", false);
                break;
            case "writeStorage":
                Default("path", "$STORAGE_FILE");
                break;
        }
        return s;
    }

    // ------------------------------------------------------------------ SDK adapter

    private SponsorkitClient Create(JsonObject args)
    {
        static string? Str(JsonObject o, string k) => o[k] is JsonValue v ? v.GetValue<string>() : null;
        SponsorkitMock? mock = null;
        if (args["mock"] is JsonValue preset) mock = preset.GetValue<string>();
        else if (args["mock"] is JsonObject custom)
            mock = SponsorkitMock.WithContributions(custom["contributions"].Deserialize<List<Contribution>>()!);
        var options = new SponsorkitOptions
        {
            GitHub = Str(args, "github"),
            OpenCollective = Str(args, "opencollective"),
            AppName = Str(args, "appName"),
            Mock = mock,
            ApiBaseUrl = Str(args, "apiBaseUrl"),
            StorageDirectory = Str(args, "storageDir"),
            Environment = ((JsonObject)args["env"]!).ToDictionary(kv => kv.Key, kv => kv.Value!.GetValue<string>()),
            DevChecks = args["devChecks"]!.GetValue<bool>(),
            OpenBrowser = OpenBrowserAsync,
            PromptForCode = PromptForCodeAsync,
        };
        if (args["cacheTtl"] is JsonValue ttl) options.CacheTtl = TimeSpan.FromSeconds(ttl.GetValue<double>());
        if (Str(args, "signInMethod") is { } method) options.SignInMethod = ParseMethod(method);
        return new SponsorkitClient(options);
    }

    private static SignInMethod ParseMethod(string m) => m switch
    {
        "loopback" => SignInMethod.Loopback,
        "paste" => SignInMethod.Paste,
        _ => SignInMethod.Auto,
    };

    /// <summary>The kit's openBrowser: a GET that follows redirects, like a browser without JavaScript.</summary>
    private static async Task OpenBrowserAsync(string url, CancellationToken ct)
    {
        using var res = await Browser.GetAsync(url, ct);
        await res.Content.ReadAsByteArrayAsync(ct);
    }

    /// <summary>The kit's promptForCode: open the paste URL like a user and read the displayed code.</summary>
    private static async Task<string> PromptForCodeAsync(string url, CancellationToken ct)
    {
        using var res = await Browser.GetAsync(url, ct);
        await res.Content.ReadAsByteArrayAsync(ct);
        return res.Headers.TryGetValues("Sponsorkit-Conformance-Code", out var v)
            ? v.First()
            : throw new InvalidOperationException($"No code at {url} (status {(int)res.StatusCode})");
    }

    private static JsonNode? Normalize(object? value) => value switch
    {
        null => null,
        bool b => JsonValue.Create(b),
        string s => JsonValue.Create(s),
        JsonNode n => n,
        CheckoutResult r => CheckoutJson(r),
        _ => JsonSerializer.SerializeToNode(value, value.GetType()),
    };

    private static JsonObject CheckoutJson(CheckoutResult r)
    {
        var o = new JsonObject { ["status"] = r.Status == CheckoutStatus.Contributed ? "contributed" : "unknown" };
        if (r.Contribution is not null) o["contribution"] = JsonSerializer.SerializeToNode(r.Contribution);
        return o;
    }

    private static string? OptString(JsonObject a, string k) => a[k] is JsonValue v ? v.GetValue<string>() : null;

    private static double? OptNumber(JsonObject a, string k) => a[k] is JsonValue v ? v.GetValue<double>() : null;

    private async Task<object?> ExecAsync(JsonObject step, SponsorkitClient? on)
    {
        SponsorkitClient Need() => on ?? throw new InvalidOperationException("No SDK instance (configure failed or was not called)");
        var action = step["action"]!.GetValue<string>();
        var a = step["args"] as JsonObject ?? new JsonObject();
        switch (action)
        {
            case "configure":
                _instance = null;
                _config = a;
                _instance = Create(a);
                return null;
            case "restart":
                if (_config is null) throw new InvalidOperationException("restart before configure");
                _instance = null;
                SponsorkitClient.ResetProcessState();
                _instance = Create(_config);
                return null;
            case "signIn":
                await Need().SignInAsync(new SignInOptions { Provider = OptString(a, "provider"), Method = ParseMethod(OptString(a, "method")!) });
                return null;
            case "isSignedIn":
                return Need().IsSignedIn();
            case "getFinancialContribution":
                return OptNumber(a, "cacheTtl") is { } ttl
                    ? await Need().GetFinancialContributionAsync(TimeSpan.FromSeconds(ttl))
                    : await Need().GetFinancialContributionAsync();
            case "openCheckout":
                {
                    var options = new CheckoutOptions
                    {
                        Provider = OptString(a, "provider"),
                        Amount = (long?)OptNumber(a, "amount"),
                        Currency = OptString(a, "currency"),
                        Frequency = OptString(a, "frequency"),
                        Timeout = OptNumber(a, "timeout") is { } t ? TimeSpan.FromSeconds(t) : null,
                        PollInterval = OptNumber(a, "pollInterval") is { } p ? TimeSpan.FromSeconds(p) : null,
                        SignInMethod = OptString(a, "method") is { } m ? ParseMethod(m) : null,
                    };
                    using var cts = new CancellationTokenSource();
                    if (OptNumber(a, "cancelAfter") is { } cancelAfter) cts.CancelAfter(TimeSpan.FromSeconds(cancelAfter));
                    return await Need().OpenCheckoutAsync(options, cts.Token);
                }
            case "checkoutUrl":
                return Need().CheckoutUrl(new CheckoutUrlOptions
                {
                    Provider = OptString(a, "provider"),
                    Amount = (long?)OptNumber(a, "amount"),
                    Currency = OptString(a, "currency"),
                    Frequency = OptString(a, "frequency"),
                });
            case "signOut":
                await Need().SignOutAsync();
                return null;
            case "nagDue":
                {
                    var nagOptions = new NagOptions(OptString(a, "id")!) { Every = (int)OptNumber(a, "every")!.Value };
                    if (OptString(a, "orEvery") is { } orEvery) nagOptions.OrEvery = NagOptions.ParseDuration(orEvery);
                    Func<ContributionResult, bool> predicate = OptString(a, "predicate") switch
                    {
                        "always" => _ => true,
                        "never" => _ => false,
                        "noActive" => fc => fc.Active().Count == 0,
                        var other => throw new InvalidOperationException("Unknown predicate " + other),
                    };
                    return await Need().Nag(nagOptions).DueAsync(predicate, a["force"]!.GetValue<bool>());
                }
            case "nagShown":
                Need().Nag(new NagOptions(OptString(a, "id")!)).Shown();
                return null;
            case "verifySession":
                {
                    var targets = (JsonObject)a["targets"]!;
                    return await SponsorkitServer.VerifySessionAsync(OptString(a, "token")!, new VerifySessionOptions
                    {
                        GitHub = OptString(targets, "github"),
                        OpenCollective = OptString(targets, "opencollective"),
                        ApiBaseUrl = _server.BaseUrl,
                    });
                }
            case "control":
                await _server.CallAsync(HttpMethod.Patch, "/__control", a);
                return null;
            case "mintSession":
                {
                    var r = await _server.CallAsync(HttpMethod.Post, "/__control/sessions", a);
                    _minted = r["sessionToken"]!.GetValue<string>();
                    return r;
                }
            case "writeStorage":
                {
                    var path = OptString(a, "path")!;
                    var dir = Path.GetDirectoryName(path)!;
                    if (OperatingSystem.IsWindows()) Directory.CreateDirectory(dir);
                    else Directory.CreateDirectory(dir, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
                    await System.IO.File.WriteAllTextAsync(path, a["json"]!.ToJsonString());
                    if (!OperatingSystem.IsWindows()) System.IO.File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
                    return null;
                }
            case "wait":
                await Task.Delay(TimeSpan.FromSeconds(OptNumber(a, "seconds")!.Value));
                return null;
            default:
                throw new InvalidOperationException("Unknown action " + action);
        }
    }

    // ------------------------------------------------------------------ run

    private async Task RunAsync()
    {
        var storageDir = Path.Combine(_server.StorageRoot, $"{Id}-{Guid.NewGuid().ToString("N")[..8]}");
        await _server.CallAsync(HttpMethod.Post, "/__control/reset");
        await _server.CallAsync(HttpMethod.Post, "/__control", new JsonObject { ["scenario"] = Id });
        SponsorkitClient.ResetProcessState();
        var unreachable = (await _server.CallAsync(HttpMethod.Get, "/__control/unreachable"))["baseUrl"]!.GetValue<string>();
        var startSeq = (await _server.CallAsync(HttpMethod.Get, "/__control"))["lastRequestSeq"]!.GetValue<int>();
        _static["$BASE_URL"] = _server.BaseUrl;
        _static["$STORAGE_DIR"] = storageDir;
        _static["$UNREACHABLE_BASE_URL"] = unreachable;

        var steps = (JsonArray)_scenario["steps"]!;
        for (var index = 0; index < steps.Count; index++)
        {
            var raw = WithDefaults((JsonObject)steps[index]!);
            var action = raw["action"]!.GetValue<string>();
            var label = $"step {index + 1} ({action})";
            var seq = (await _server.CallAsync(HttpMethod.Get, "/__control"))["lastRequestSeq"]!.GetValue<int>();
            var watch = Stopwatch.StartNew();
            object? returned = null;
            Exception? thrown = null;
            try
            {
                if (action == "group")
                {
                    foreach (var s in (JsonArray)raw["steps"]!)
                        returned = await ExecAsync((JsonObject)(await ResolveAsync(s))!, _instance);
                }
                else if (action == "parallel")
                {
                    if (_config is null) throw new InvalidOperationException("parallel before configure");
                    var args = (JsonObject)raw["args"]!;
                    var inner = (JsonObject)(await ResolveAsync(args["step"]))!;
                    var instances = Enumerable.Range(0, args["instances"]!.GetValue<int>()).Select(_ => Create(_config)).ToList();
                    returned = await Task.WhenAll(instances.Select(i => Task.Run(() => ExecAsync(inner, i))));
                }
                else
                {
                    returned = await ExecAsync((JsonObject)(await ResolveAsync(raw))!, _instance);
                }
            }
            catch (Exception e)
            {
                thrown = e;
            }
            var seconds = watch.Elapsed.TotalSeconds;
            var problems = new List<string>();
            var expect = raw["expect"] as JsonObject;
            var wantThrows = expect?["throws"]?.GetValue<string>();
            if (thrown is not null)
            {
                var code = (thrown as SponsorkitError)?.Code;
                if (wantThrows is null) problems.Add($"unexpected error: {code ?? thrown.ToString()}");
                else if (code != wantThrows) problems.Add($"expected error {wantThrows}, got {code ?? thrown.ToString()}");
            }
            else if (wantThrows is not null)
            {
                problems.Add($"expected error {wantThrows}, but the step succeeded");
            }
            if (expect is not null)
            {
                var e = (JsonObject)(await ResolveAsync(expect))!;
                var value = Normalize(returned is object?[] arr ? new JsonArray(arr.Select(Normalize).ToArray()) : returned);
                if (thrown is null && e.ContainsKey("returns")) problems.AddRange(Matcher.Match(value, e["returns"], "returns"));
                if (thrown is null && e["contributionIds"] is JsonArray ids)
                {
                    var list = value?["contributions"] as JsonArray ?? (value?["contribution"] is JsonObject c ? new JsonArray(c.DeepClone()) : []);
                    var got = list.Select(x => x!["id"]!.GetValue<string>()).OrderBy(x => x, StringComparer.Ordinal).ToList();
                    var want = ids.Select(x => x!.GetValue<string>()).OrderBy(x => x, StringComparer.Ordinal).ToList();
                    if (!got.SequenceEqual(want)) problems.Add($"contribution ids [{string.Join(",", got)}] !== [{string.Join(",", want)}]");
                }
                if (e["requests"] is JsonObject req) problems.AddRange(Matcher.MatchRequests(await RequestsSinceAsync(seq), req));
                if (e["minSeconds"] is JsonValue min && seconds < min.GetValue<double>()) problems.Add($"took {seconds:F2} s, expected >= {min}");
                if (e["maxSeconds"] is JsonValue max && seconds > max.GetValue<double>()) problems.Add($"took {seconds:F2} s, expected <= {max}");
            }
            if (problems.Count > 0) throw new ScenarioFailure($"{Id} / {label}:\n  - {string.Join("\n  - ", problems)}");
        }

        if (_scenario["expect"] is JsonObject final)
        {
            var e = (JsonObject)(await ResolveAsync(final))!;
            var problems = new List<string>();
            if (e["requests"] is JsonObject req) problems.AddRange(Matcher.MatchRequests(await RequestsSinceAsync(startSeq), req));
            foreach (var f in (JsonArray?)e["files"] ?? [])
                problems.AddRange(CheckFile((JsonObject)f!));
            if (problems.Count > 0) throw new ScenarioFailure($"{Id} / final expectations:\n  - {string.Join("\n  - ", problems)}");
        }
    }

    private async Task<JsonArray> RequestsSinceAsync(int seq) =>
        (JsonArray)(await _server.CallAsync(HttpMethod.Get, $"/__control/requests?since={seq}"))["requests"]!;

    private static List<string> CheckFile(JsonObject f)
    {
        var problems = new List<string>();
        if (f["glob"] is JsonValue globNode)
        {
            var glob = globNode.GetValue<string>();
            var dir = Path.GetDirectoryName(glob)!;
            var re = new Regex("^" + string.Join(".*", Path.GetFileName(glob).Split('*').Select(Regex.Escape)) + "$");
            var n = Directory.Exists(dir) ? Directory.EnumerateFileSystemEntries(dir).Count(p => re.IsMatch(Path.GetFileName(p))) : 0;
            if (n != f["count"]!.GetValue<int>()) problems.Add($"{glob}: {n} file(s), expected {f["count"]}");
            return problems;
        }
        var path = f["path"]!.GetValue<string>();
        var isFile = System.IO.File.Exists(path);
        var isDir = Directory.Exists(path);
        var exists = isFile || isDir;
        var want = f["exists"]!;
        if (want.GetValueKind() == JsonValueKind.True && !exists) problems.Add($"{path}: does not exist");
        if (want.GetValueKind() == JsonValueKind.False && exists) problems.Add($"{path}: exists but should not");
        if (!exists) return problems;
        var kind = f["kind"]?.GetValue<string>();
        if (kind == "directory" && !isDir) problems.Add($"{path}: not a directory");
        if (kind == "file" && !isFile) problems.Add($"{path}: not a file");
        if (f["mode"] is JsonValue modeNode && !OperatingSystem.IsWindows())
        {
            var mode = "0" + Convert.ToString((int)System.IO.File.GetUnixFileMode(path) & 0x1FF, 8);
            if (mode != modeNode.GetValue<string>()) problems.Add($"{path}: mode {mode}, expected {modeNode}");
        }
        if (f.ContainsKey("json") || f.ContainsKey("schema"))
        {
            JsonNode? data;
            try
            {
                data = JsonNode.Parse(System.IO.File.ReadAllText(path));
            }
            catch (Exception ex)
            {
                problems.Add($"{path}: not valid JSON ({ex.Message})");
                return problems;
            }
            if (f["schema"]?.GetValue<string>() == "storage-file")
                problems.AddRange(StorageFileValidator.Validate(data).Select(p => $"{path}: storage-file schema: {p}"));
            if (f.ContainsKey("json")) problems.AddRange(Matcher.Match(data, f["json"], Path.GetFileName(path)));
        }
        return problems;
    }
}

internal sealed class ScenarioFailure(string message) : Exception(message);
