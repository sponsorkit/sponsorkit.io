---
title: Backend verification in .NET
description: Verify a supporter's session token on your server with SponsorkitServer.VerifySessionAsync, for example in an ASP.NET Core endpoint.
sidebar_label: Backend verification
order: 70
---

Anything your app decides on the user's machine can be patched out. When a contribution must unlock something on
*your* server (a download, an API quota, a hosted feature), the app sends its session token to your backend, and
the backend asks Sponsorkit about it. No API key is involved: the token is sealed by Sponsorkit and can't be
forged or edited. The full picture is in [verify supporters on your backend](../../guides/backend-verification.md).

## `SponsorkitServer.VerifySessionAsync`

```csharp
public static Task<ContributionResult> VerifySessionAsync(
    string sessionToken, VerifySessionOptions options, CancellationToken cancellationToken = default)
```

It calls Sponsorkit live (no cache, no local storage), checks that the session was issued for **exactly** the
targets in `options`, and returns the same `ContributionResult` the client gets. `Supporter.Id` is stable for a
person and your target set, so you can key your own user records on it.

| `VerifySessionOptions` | Default | Meaning |
|---|---|---|
| `GitHub`, `OpenCollective` | `null` | The targets your backend expects. At least one is required. |
| `ApiBaseUrl` | `https://api.sponsorkit.io` | For self-hosting. |
| `HttpClient` | a shared internal client | Pass one from `IHttpClientFactory` if you manage handlers centrally. |
| `RequestTimeout` | 30 seconds | `TimeSpan.Zero` or `Timeout.InfiniteTimeSpan` disables it; negative throws `invalid_config`. |

It throws `SponsorkitError` with:

| Code | When | Typical response |
|---|---|---|
| `session_invalid` | The token is empty, malformed, expired, tampered with or rejected. | `401`: ask the user to sign in again. |
| `targets_mismatch` | The token is genuine but was issued for other targets (another app). | `401` or `403`. |
| `network_error` | Sponsorkit was unreachable, timed out, or answered 5xx, 429 or something unexpected. `RetryAfter` is set when Sponsorkit sent `Retry-After`. | `503`, and retry later. |
| `invalid_config` | Your expected targets are malformed, or `RequestTimeout` is negative. | A bug on your side. |

Cancelling the token throws `OperationCanceledException`, as usual in .NET.

## In ASP.NET Core

A minimal API endpoint that serves a download only to active supporters. The client sends its token in an
`X-Sponsorkit-Session` header; the name is up to you.

```csharp title="Program.cs"
using Sponsorkit;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var expected = new VerifySessionOptions { GitHub = "octocat", OpenCollective = "my-collective" };

app.MapGet("/download", async (HttpRequest request, CancellationToken ct) =>
{
    var token = request.Headers["X-Sponsorkit-Session"].ToString();
    try
    {
        var fc = await SponsorkitServer.VerifySessionAsync(token, expected, ct);
        if (fc.Active().Count == 0)
            return Results.Json(new { error = "An active contribution is required." }, statusCode: StatusCodes.Status403Forbidden);

        // fc.Supporter!.Id is stable for this person and these targets: use it as your user key.
        return Results.Text($"Here is your download, {fc.Supporter!.Id}.");
    }
    catch (SponsorkitError e) when (e.Code is SponsorkitErrorCodes.SessionInvalid or SponsorkitErrorCodes.TargetsMismatch)
    {
        return Results.Unauthorized();
    }
    catch (SponsorkitError e) when (e.Code == SponsorkitErrorCodes.NetworkError)
    {
        if (e.RetryAfter is { } wait)
            request.HttpContext.Response.Headers.RetryAfter = ((int)Math.Ceiling(wait.TotalSeconds)).ToString(System.Globalization.CultureInfo.InvariantCulture);
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    }
});

app.Run();
```

Each call makes one request to Sponsorkit. If an endpoint is hit often, cache the verdict for a short time
keyed by the token (for example with `IMemoryCache`), and keep it well below the time you'd tolerate a cancelled
sponsorship still working.

## Sending the token from a .NET app

The .NET `SponsorkitClient` doesn't have a session-token accessor yet. The token is the `sessionToken` field of
the [state file](platform-notes.md#where-state-is-kept), named after `sk.TargetsHash`. When you set
`StorageDirectory` yourself you know where that file is:

```csharp title="Program.cs"
using System.Text.Json;
using Sponsorkit;

var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "my-app", "sponsorkit");
var sk = new SponsorkitClient(new SponsorkitOptions { GitHub = "octocat", StorageDirectory = dir });

await sk.GetFinancialContributionAsync(); // also stores a renewed token when the old one is getting old

string? token = null;
var file = Path.Combine(dir, sk.TargetsHash + ".json");
if (File.Exists(file))
{
    using var doc = JsonDocument.Parse(File.ReadAllText(file));
    if (doc.RootElement.TryGetProperty("sessionToken", out var t)) token = t.GetString();
}

using var http = new HttpClient();
using var request = new HttpRequestMessage(HttpMethod.Get, "https://api.example.com/download");
if (token is not null) request.Headers.Add("X-Sponsorkit-Session", token);
using var response = await http.SendAsync(request);
Console.WriteLine(response.StatusCode);
```

The token is a bearer credential for the supporter's contribution data on your targets. Send it only to your
own backend, over HTTPS, and don't log it. The [security model](../../concepts/security.md) explains what it can
and can't be used for.
