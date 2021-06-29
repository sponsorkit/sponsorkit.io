using System;
using System.Diagnostics;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Octokit;
using Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.Encryption;
using Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.GitHub;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Builders;
using Sponsorkit.Infrastructure.Options;
using Sponsorkit.Infrastructure.Options.GitHub;
using Stripe;
using GitHubUser = Octokit.User;

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

        private readonly IOptionsMonitor<GitHubOptions> gitHubOptionsMonitor;
        private readonly IOptionsMonitor<JwtOptions> jwtOptionsMonitor;

        private readonly CustomerService customerService;

        private readonly DataContext dataContext;

        public Post(
            IGitHubClientFactory gitHubClientFactory,
            IGitHubClient gitHubClient,
            IOptionsMonitor<GitHubOptions> gitHubOptionsMonitor,
            IOptionsMonitor<JwtOptions> jwtOptionsMonitor,
            IAesEncryptionHelper aesEncryptionHelper,
            DataContext dataContext,
            CustomerService customerService)
        {
            this.gitHubClientFactory = gitHubClientFactory;
            this.gitHubClient = gitHubClient;
            this.gitHubOptionsMonitor = gitHubOptionsMonitor;
            this.jwtOptionsMonitor = jwtOptionsMonitor;
            this.dataContext = dataContext;
            this.customerService = customerService;
            this.aesEncryptionHelper = aesEncryptionHelper;
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

                    var customer = await CreateStripeCustomerForUserAsync(email, cancellationToken);
                    user.StripeCustomerId = customer.Id;
                    await dataContext.SaveChangesAsync(cancellationToken);

                    return user;
                });

            var jwtToken = GenerateJwtTokenForUser(authenticatedUser.Id);
            return new Response(jwtToken);
        }

        private string GenerateJwtTokenForUser(Guid userId)
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(new[]
                {
                    new Claim(JwtRegisteredClaimNames.Sub, userId.ToString())
                }),
                Expires = Debugger.IsAttached ? 
                    DateTime.UtcNow.AddHours(24) : 
                    DateTime.UtcNow.AddMinutes(15),
                SigningCredentials = new SigningCredentials(
                    new SymmetricSecurityKey(
                        Encoding.ASCII.GetBytes(jwtOptionsMonitor.CurrentValue.PrivateKey)),
                    SecurityAlgorithms.HmacSha512Signature),
                Audience = "sponsorkit.io",
                Issuer = "sponsorkit.io"
            };

            var token = tokenHandler.CreateToken(tokenDescriptor);
            return tokenHandler.WriteToken(token);
        }

        private async Task<Customer> CreateStripeCustomerForUserAsync(
            string email,
            CancellationToken cancellationToken)
        {
            return await customerService.CreateAsync(
                new CustomerCreateOptions()
                {
                    Email = email
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