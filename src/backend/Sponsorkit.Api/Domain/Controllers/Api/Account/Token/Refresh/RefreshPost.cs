using System;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Sponsorkit.BusinessLogic.Infrastructure.AspNet;
using Sponsorkit.BusinessLogic.Infrastructure.Options;
using Sponsorkit.BusinessLogic.Infrastructure.Security.Jwt;

namespace Sponsorkit.Api.Domain.Controllers.Api.Account.Token.Refresh;

public record PostResponse(
    string Token);

public record PostRequest(
    string Token);
    
public class RefreshPost : EndpointBaseAsync
    .WithRequest<PostRequest>
    .WithActionResult<PostResponse>
{
    private readonly ITokenFactory tokenFactory;
    private readonly IOptionsMonitor<JwtOptions> jwtOptionsMonitor;
    private readonly DataContext dataContext;

    public RefreshPost(
        ITokenFactory tokenFactory,
        IOptionsMonitor<JwtOptions> jwtOptionsMonitor,
        DataContext dataContext)
    {
        this.tokenFactory = tokenFactory;
        this.jwtOptionsMonitor = jwtOptionsMonitor;
        this.dataContext = dataContext;
    }
        
    [HttpPost("account/token/refresh")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public override async Task<ActionResult<PostResponse>> HandleAsync(PostRequest request, CancellationToken cancellationToken = new CancellationToken())
    {
        var claimsPrincipal = JwtValidator.GetClaimsPrincipal(
            request.Token,
            JwtValidator.GetValidationParameters(
                jwtOptionsMonitor.CurrentValue,
                TimeSpan.FromDays(365 * 10)));
        if (claimsPrincipal == null)
            return Unauthorized();

        var userId = claimsPrincipal.GetRequiredId();
        var user = await dataContext.Users.SingleOrDefaultAsync(
            x => x.Id == userId,
            cancellationToken);
        if (user == null)
            return Unauthorized();

        var token = tokenFactory.Create(claimsPrincipal.Claims);
        return new PostResponse(token);
    }
}