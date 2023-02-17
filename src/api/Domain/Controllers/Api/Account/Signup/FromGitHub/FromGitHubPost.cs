using System;
using System.Data;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Octokit;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Builders;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Sponsorkit.BusinessLogic.Domain.Models.Stripe;
using Sponsorkit.BusinessLogic.Infrastructure.GitHub;
using Sponsorkit.BusinessLogic.Infrastructure.Options.GitHub;
using Sponsorkit.BusinessLogic.Infrastructure.Security.Encryption;
using Sponsorkit.BusinessLogic.Infrastructure.Security.Jwt;
using GitHubUser = Octokit.User;
using User = Sponsorkit.BusinessLogic.Domain.Models.Database.User;

namespace Sponsorkit.Domain.Controllers.Api.Account.Signup.FromGitHub;

public record Request(
    string GitHubAuthenticationCode);

public record Response(
    string Token);

public class FromGitHubPost : EndpointBaseAsync
    .WithRequest<Request>
    .WithActionResult<Response>
{
    private readonly IGitHubClientFactory gitHubClientFactory;
    private readonly IGitHubClient gitHubClient;
    private readonly ITokenFactory tokenFactory;
    private readonly IEncryptionHelper encryptionHelper;

    private readonly IOptionsMonitor<GitHubOptions> gitHubOptionsMonitor;

    private readonly DataContext dataContext;
    private readonly StripeCustomerBuilder stripeCustomerBuilder;
    private readonly UserBuilder userBuilder;

    public FromGitHubPost(
        IGitHubClientFactory gitHubClientFactory,
        IGitHubClient gitHubClient,
        IOptionsMonitor<GitHubOptions> gitHubOptionsMonitor,
        ITokenFactory tokenFactory,
        IEncryptionHelper encryptionHelper,
        DataContext dataContext,
        StripeCustomerBuilder stripeCustomerBuilder,
        UserBuilder userBuilder)
    {
        this.gitHubClientFactory = gitHubClientFactory;
        this.gitHubClient = gitHubClient;
        this.gitHubOptionsMonitor = gitHubOptionsMonitor;
        this.dataContext = dataContext;
        this.stripeCustomerBuilder = stripeCustomerBuilder;
        this.userBuilder = userBuilder;
        this.tokenFactory = tokenFactory;
        this.encryptionHelper = encryptionHelper;
    }

    [HttpPost("account/signup/from-github")]
    [AllowAnonymous]
    public override async Task<ActionResult<Response>> HandleAsync(Request request, CancellationToken cancellationToken = new())
    {
        var gitHubCode = request.GitHubAuthenticationCode;

        var gitHubAccessToken = await ExchangeGitHubAuthenticationCodeForAccessTokenAsync(gitHubCode);
        var currentGitHubUser = await GetCurrentGitHubUserFromTokenAsync(gitHubAccessToken);

        var email = currentGitHubUser.Email;

        var authenticatedUser = await dataContext.ExecuteInTransactionAsync(
            async () =>
            {
                var existingUser = await dataContext.Users.SingleOrDefaultAsync(
                    x => x.GitHub!.Id == currentGitHubUser.Id,
                    cancellationToken);
                if (existingUser != null)
                {
                    await UpdateAccessTokenOnExistingUserAsync(
                        existingUser, 
                        currentGitHubUser, 
                        gitHubAccessToken, 
                        cancellationToken);

                    return existingUser;
                }

                var user = await userBuilder
                    .WithEmail(email)
                    .WithStripeCustomerId(string.Empty)
                    .WithGitHub(
                        currentGitHubUser.Id,
                        currentGitHubUser.Login,
                        gitHubAccessToken)
                    .BuildAsync(cancellationToken);

                await dataContext.Users.AddAsync(user, cancellationToken);
                await dataContext.SaveChangesAsync(cancellationToken);

                var customer = await stripeCustomerBuilder
                    .WithEmail(email)
                    .WithUser(user)
                    .BuildAsync(CancellationToken.None);
                user.StripeCustomerId = customer.Id;
                await dataContext.SaveChangesAsync(CancellationToken.None);

                return user;
            },
            IsolationLevel.Serializable);

        var jwtToken = GenerateJwtTokenForUser(authenticatedUser);
        return new Response(jwtToken);
    }

    private async Task UpdateAccessTokenOnExistingUserAsync(
        User existingUser, 
        GitHubUser currentGitHubUser, 
        string gitHubAccessToken, 
        CancellationToken cancellationToken)
    {
        existingUser.GitHub ??= new UserGitHubInformation()
        {
            Id = currentGitHubUser.Id,
            Username = currentGitHubUser.Login
        };

        existingUser.GitHub.EncryptedAccessToken = await encryptionHelper.EncryptAsync(gitHubAccessToken);
        await dataContext.SaveChangesAsync(cancellationToken);
    }

    private string GenerateJwtTokenForUser(User user)
    {
        return tokenFactory.Create(new[]
        {
            new Claim(
                JwtRegisteredClaimNames.Sub, 
                user.Id.ToString()), 
            new Claim(
                JwtRegisteredClaimNames.Name, 
                user.GitHub?.Username ?? ""), 
            new Claim(
                ClaimTypes.Role, 
                "User")
        });
    }

    private async Task<GitHubUser> GetCurrentGitHubUserFromTokenAsync(string token)
    {
        var client = gitHubClientFactory.CreateClientFromOAuthAuthenticationToken(token);
        return
            await client.User.Current() ??
            throw new InvalidOperationException("Could not get current GitHub user from access token.");
    }

    private async Task<string> ExchangeGitHubAuthenticationCodeForAccessTokenAsync(string code)
    {
        var options = gitHubOptionsMonitor.CurrentValue;

        var tokenResponse = await gitHubClient.Oauth.CreateAccessToken(
            new OauthTokenRequest(
                options.OAuth.ClientId,
                options.OAuth.ClientSecret,
                code));

        return
            tokenResponse?.AccessToken ??
            throw new InvalidOperationException("Could not get GitHub access token from authentication code.");
    }
}