using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Swashbuckle.AspNetCore.Annotations;

namespace Sponsorkit.Api.Domain.Controllers.Api.Badges;

[AllowAnonymous]
public class Get : EndpointBaseAsync
    .WithRequest<GetRequest>
    .WithActionResult<string>
{
    private readonly DataContext _dataContext;

    public Get(DataContext dataContext)
    {
        _dataContext = dataContext;
    }

    [AllowAnonymous]
    [HttpGet("/api/badges/{type}/{identifier}")]
    [SwaggerOperation("Gets a shield-style SVG badge for a repo or hunter profile.")]
    public override async Task<ActionResult<string>> HandleAsync(
        [FromRoute] GetRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Type) ||
            string.IsNullOrWhiteSpace(request.Identifier))
        {
            label = "error";
            message = "invalid request";
            color = "red";
            return Content(BuildShieldSvg(label, message, color), "image/svg+xml");
        }

        string label;
        string message;
        string color;

        switch (request.Type.ToLowerInvariant())
        {
            case "repo":
                var parts = request.Identifier.Split('/');
                if (parts.Length != 2 || string.IsNullOrWhiteSpace(parts[0]) || string.IsNullOrWhiteSpace(parts[1]))
                {
                    label = "repo";
                    message = "invalid identifier";
                    color = "red";
                    return Content(BuildShieldSvg(label, message, color), "image/svg+xml");
                }

                var repo = await _dataContext.Repositories
                    .Include(r => r.Bounties)
                    .FirstOrDefaultAsync(r => r.Owner == parts[0] && r.Name == parts[1],
                        cancellationToken);

                if (repo == null)
                {
                    label = "repo";
                    message = "not found";
                    color = "red";
                    return Content(BuildShieldSvg(label, message, color), "image/svg+xml");
                }

                var totalBountyAmount = repo.Bounties?.Sum(b => b.AmountInHundreds ?? 0) ?? 0;
                var bountyCount = repo.Bounties?.Count ?? 0;

                label = "bounties";
                message = $"${totalBountyAmount / 100:N0} ({bountyCount})";
                color = GetAmountColor(totalBountyAmount);
                
                return Content(BuildShieldSvg(label, message, color), "image/svg+xml");

            case "profile":
                var user = await _dataContext.Users
                    .Include(u => u.Bounties)
                    .FirstOrDefaultAsync(u => u.Username == request.Identifier
                                              || u.GitHubUsername == request.Identifier,
                        cancellationToken);

                if (user == null)
                {
                    label = "hunter";
                    message = "not found";
                    color = "red";
                    return Content(BuildShieldSvg(label, message, color), "image/svg+xml");
                }

                var totalEarned = user.Bounties?.Sum(b => b.AmountInHundreds ?? 0) ?? 0;
                var bountiesClaimed = user.Bounties?.Count ?? 0;

                label = "earned";
                message = $"${totalEarned / 100:N0} ({bountiesClaimed})";
                color = GetAmountColor(totalEarned);

                return Content(BuildShieldSvg(label, message, color), "image/svg+xml");

            default:
                label = "badge";
                message = "unknown type";
                color = "red";
                return Content(BuildShieldSvg(label, message, color), "image/svg+xml");
        }
    }

    private static string GetAmountColor(long amountInHundreds)
    {
        if (amountInHundreds == 0) return "lightgrey";
        if (amountInHundreds >= 500000) return "brightgreen";   // $5000+
        if (amountInHundreds >= 100000) return "green";          // $1000+
        if (amountInHundreds >= 10000) return "yellowgreen";     // $100+
        if (amountInHundreds >= 1000) return "yellow";           // $10+
        return "orange";
    }

    private static string BuildShieldSvg(string label, string message, string color)
    {
        var colorHex = color switch
        {
            "brightgreen" => "#4c1",
            "green" => "#97ca00",
            "yellowgreen" => "#a4a61d",
            "yellow" => "#dfb317",
            "orange" => "#fe7d37",
            "red" => "#e05d44",
            "blue" => "#007ec6",
            "grey" => "#555",
            "lightgrey" => "#9f9f9f",
            _ => "#007ec6"
        };

        var labelWidth = label.Length * 8 + 10;
        var messageWidth = message.Length * 8 + 10;
        var totalWidth = labelWidth + messageWidth;

        return $@"<svg xmlns=""http://www.w3.org/2000/svg"" xmlns:xlink=""http://www.w3.org/1999/xlink"" width=""{totalWidth}"" height=""20"" role=""img"" aria-label=""{label}: {message}"">
  <title>{label}: {message}</title>
  <linearGradient id=""s"" x2=""0"" y2=""100%"">
    <stop offset=""0"" stop-color=""#bbb"" stop-opacity="".1""/>
    <stop offset=""1"" stop-opacity="".1""/>
  </linearGradient>
  <clipPath id=""r"">
    <rect width=""{totalWidth}"" height=""20"" rx=""3"" fill=""#fff""/>
  </clipPath>
  <g clip-path=""url(#r)"">
    <rect width=""{labelWidth}"" height=""20"" fill=""#555""/>
    <rect x=""{labelWidth}"" width=""{messageWidth}"" height=""20"" fill=""{colorHex}""/>
    <rect width=""{totalWidth}"" height=""20"" fill=""url(#s)""/>
  </g>
  <g fill=""#fff"" text-anchor=""middle"" font-family=""Verdana,Geneva,DejaVu Sans,sans-serif"" font-size=""11"">
    <text x=""{labelWidth / 2}"" y=""15"" fill=""#010101"" fill-opacity="".3"">{label}</text>
    <text x=""{labelWidth / 2}"" y=""14"">{label}</text>
    <text x=""{labelWidth + messageWidth / 2}"" y=""15"" fill=""#010101"" fill-opacity="".3"">{message}</text>
    <text x=""{labelWidth + messageWidth / 2}"" y=""14"">{message}</text>
  </g>
</svg>";
    }
}

public class GetRequest
{
    [FromRoute] public string Type { get; set; } = "";
    [FromRoute] public string Identifier { get; set; } = "";
}
