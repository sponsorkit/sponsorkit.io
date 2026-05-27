using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Api.Domain.Controllers.Api.Badges;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;

namespace Sponsorkit.Api.Domain.Controllers.Api.Badges.Users;

public record Request(
    [FromRoute] string GitHubUsername);

public class Get : EndpointBaseAsync
    .WithRequest<Request>
    .WithActionResult<FileContentResult>
{
    private const string SvgContentType = "image/svg+xml; charset=utf-8";
    private readonly DataContext dataContext;

    public Get(DataContext dataContext)
    {
        this.dataContext = dataContext;
    }

    [HttpGet("badges/users/{gitHubUsername}/badge.svg")]
    [AllowAnonymous]
    [Produces(SvgContentType)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any)]
    public override async Task<ActionResult<FileContentResult>> HandleAsync(
        [FromRoute] Request request,
        CancellationToken cancellationToken = new())
    {
        var bountyAmounts = await dataContext.Bounties
            .Where(x =>
                x.AwardedTo != null &&
                x.AwardedTo.GitHub != null &&
                x.AwardedTo.GitHub.Username == request.GitHubUsername)
            .Select(x => x.Payments.Sum(p => p.AmountInHundreds))
            .ToArrayAsync(cancellationToken);

        var amount = bountyAmounts.Sum();
        var message = bountyAmounts.Length == 1
            ? $"{BadgeSvgFactory.FormatDollarAmount(amount)} earned"
            : $"{BadgeSvgFactory.FormatDollarAmount(amount)} across {bountyAmounts.Length} wins";

        Response.Headers.CacheControl = "public, max-age=300, s-maxage=3600";

        return File(
            Encoding.UTF8.GetBytes(BadgeSvgFactory.Render("bountyhunt", message, "#0366d6")),
            SvgContentType);
    }
}
