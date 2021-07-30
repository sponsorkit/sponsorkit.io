using System;
using System.Collections.Generic;
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
using Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.Encryption;
using Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.GitHub;
using Sponsorkit.Domain.Models.Builders;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.Options.GitHub;
using Sponsorkit.Infrastructure.Security.Jwt;
using Stripe;
using GitHubUser = Octokit.User;
using User = Sponsorkit.Domain.Models.User;

namespace Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub
{
    public record Request(
        string GitHubAuthenticationCode);

    public record Response(
        string Token);

    public class Post : BaseAsyncEndpoint
        .WithRequest<Request>
        .WithResponse<Response>
    {
        private readonly IGitHubClientFactory gitHubClientFactory;
        private readonly IGitHubClient gitHubClient;
        private readonly IAesEncryptionHelper aesEncryptionHelper;
        private readonly ITokenFactory tokenFactory;

        private readonly IOptionsMonitor<GitHubOptions> gitHubOptionsMonitor;

        private readonly CustomerService customerService;

        private readonly DataContext dataContext;

        public Post(
            IGitHubClientFactory gitHubClientFactory,
            IGitHubClient gitHubClient,
            IOptionsMonitor<GitHubOptions> gitHubOptionsMonitor,
            IAesEncryptionHelper aesEncryptionHelper,
            ITokenFactory tokenFactory,
            DataContext dataContext,
            CustomerService customerService)
        {
            this.gitHubClientFactory = gitHubClientFactory;
            this.gitHubClient = gitHubClient;
            this.gitHubOptionsMonitor = gitHubOptionsMonitor;
            this.dataContext = dataContext;
            this.customerService = customerService;
            this.aesEncryptionHelper = aesEncryptionHelper;
            this.tokenFactory = tokenFactory;
        }

        [HttpPost("/api/signup/from-github")]
        [AllowAnonymous]
        public override async Task<ActionResult<Response>> HandleAsync(Request request, CancellationToken cancellationToken = new())
        {
            if (request == null)
                return new BadRequestObjectResult("Request data was incorrect.");

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
                        return existingUser;

                    var user = new UserBuilder()
                        .WithEmail(await aesEncryptionHelper.EncryptAsync(email))
                        .WithStripeCustomerId(string.Empty)
                        .WithGitHub(
                            currentGitHubUser.Id,
                            currentGitHubUser.Login,
                            await aesEncryptionHelper.EncryptAsync(gitHubAccessToken))
                        .Build();

                    await dataContext.Users.AddAsync(user, cancellationToken);
                    await dataContext.SaveChangesAsync(cancellationToken);

                    var customer = await CreateStripeCustomerForUserAsync(user.Id, email, cancellationToken);
                    user.StripeCustomerId = customer.Id;
                    await dataContext.SaveChangesAsync(cancellationToken);

                    return user;
                });

            var jwtToken = GenerateJwtTokenForUser(authenticatedUser);
            return new Response(jwtToken);
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

        private async Task<Customer> CreateStripeCustomerForUserAsync(
            Guid userId,
            string email,
            CancellationToken cancellationToken)
        {
            return await customerService.CreateAsync(
                new CustomerCreateOptions()
                {
                    Email = email,
                    Metadata = new Dictionary<string, string>()
                    {
                        { "UserId", userId.ToString() }
                    }
                },
                cancellationToken: cancellationToken);
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
}