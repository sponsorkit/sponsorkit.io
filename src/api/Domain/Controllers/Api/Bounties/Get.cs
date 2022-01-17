using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Octokit.GraphQL;
using Sponsorkit.Domain.Models.Context;

namespace Sponsorkit.Domain.Controllers.Api.Bounties;

public record Response(
    BountyResponse[] Bounties);

public record BountyResponse(
    long AmountInHundreds,
    int BountyCount,
    BountyGitHubResponse GitHub);

public record BountyGitHubResponse(
    int Number,
    string Title,
    string OwnerName,
    string RepositoryName);
    
public class Get : EndpointBaseAsync
    .WithoutRequest
    .WithActionResult<Response>
{
    private readonly DataContext dataContext;

    public Get(
        DataContext dataContext)
    {
        this.dataContext = dataContext;
    }
        
    [HttpGet("/bounties")]
    [AllowAnonymous]
    public override async Task<ActionResult<Response>> HandleAsync(CancellationToken cancellationToken = new CancellationToken())
    {
        var databaseResponse = await dataContext.Bounties
            .AsQueryable()
            .GroupBy(x => new
            {
                x.Issue.GitHub.Number,
                Title = x.Issue.GitHub.TitleSnapshot,
                x.Issue.Repository.GitHub.OwnerName,
                RepositoryName = x.Issue.Repository.GitHub.Name
            })
            .Select(x => new
            {
                TotalAmountInHundreds = x.Sum(b => b.Payments
                    .Sum(p => p.AmountInHundreds)),
                Number = x.Key.Number,
                Title = x.Key.Title,
                BountyCount = x.Count(),
                x.Key.OwnerName,
                x.Key.RepositoryName
            })
            .OrderByDescending(x => x.TotalAmountInHundreds)
            .Take(100)
            .ToArrayAsync(cancellationToken);
            
        return new Response(databaseResponse
            .Select(x => new BountyResponse(
                x.TotalAmountInHundreds,
                x.BountyCount,
                new BountyGitHubResponse(
                    x.Number,
                    x.Title,
                    x.OwnerName,
                    x.RepositoryName)))
            .ToArray());
    }
}