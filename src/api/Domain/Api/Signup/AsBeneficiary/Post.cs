using System;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Options;
using Octokit;
using Sponsorkit.Domain.Api.Signup.AsBeneficiary.Encryption;
using Sponsorkit.Domain.Api.Signup.AsBeneficiary.GitHub;
using Sponsorkit.Domain.Models;
using Sponsorkit.Infrastructure;
using Stripe;
using SponsorkitUser = Sponsorkit.Domain.Models.User;
using GitHubUser = Octokit.User;

namespace Sponsorkit.Domain.Api.Signup.AsBeneficiary
{
    //https://haacked.com/archive/2014/04/24/octokit-oauth/
    //https://contentlab.io/using-c-code-to-access-the-github-api/

    public record Request(
        string? Email,
        string? GitHubAuthenticationCode);

    public class Post : BaseAsyncEndpoint
        .WithRequest<Request>
        .WithoutResponse
    {
        private readonly IGitHubClientFactory gitHubClientFactory;
        private readonly IGitHubClient gitHubClient;
        private readonly IOptionsMonitor<GitHubOptions> gitHubOptionsMonitor;
        private readonly IAesEncryptionHelper aesEncryptionHelper;
        
        private readonly DataContext dataContext;
        
        private readonly CustomerService customerService;
        private readonly AccountService accountService;

        public Post(
            IGitHubClientFactory gitHubClientFactory,
            IGitHubClient gitHubClient,
            IOptionsMonitor<GitHubOptions> gitHubOptionsMonitor,
            IAesEncryptionHelper aesEncryptionHelper,
            DataContext dataContext,
            CustomerService customerService,
            AccountService accountService)
        {
            this.gitHubClientFactory = gitHubClientFactory;
            this.gitHubClient = gitHubClient;
            this.gitHubOptionsMonitor = gitHubOptionsMonitor;
            this.dataContext = dataContext;
            this.aesEncryptionHelper = aesEncryptionHelper;
            this.customerService = customerService;
            this.accountService = accountService;
        }

        [HttpPost("/api/signup/as-beneficiary")]
        public override async Task<ActionResult> HandleAsync(Request request, CancellationToken cancellationToken = new())
        {
            if (request == null)
                return new BadRequestObjectResult("Request data was incorrect.");
            
            var email = request.Email;
            if(email == null)
                return new BadRequestObjectResult("Email is required.");

            var gitHubCode = request.GitHubAuthenticationCode;
            if(gitHubCode == null)
                return new BadRequestObjectResult("GitHub OAuth code is required.");
            
            var token = await ExchangeGitHubAuthenticationCodeForAccessTokenAsync(gitHubCode);
            var currentGitHubUser = await GetCurrentGitHubUserFromTokenAsync(token);

            await dataContext.ExecuteInTransactionAsync(
                async () =>
                {
                    var user = new SponsorkitUser()
                    {
                        EncryptedGitHubAccessToken = await aesEncryptionHelper.EncryptAsync(token),
                        EncryptedEmail = await aesEncryptionHelper.EncryptAsync(email),
                        GitHubId = currentGitHubUser.Id,
                        CreatedAtUtc = DateTime.UtcNow
                    };
                    await dataContext.Users.AddAsync(user, cancellationToken);
                    await dataContext.SaveChangesAsync(cancellationToken);

                    await CreateStripeCustomerAsync(user, email, cancellationToken);
                    await CreateStripeAccountAsync(user, email, cancellationToken);

                    await SendMailAsync(
                        email,
                        "Fill in your information with Stripe",
                        $"Yada yada: https://sponsorkit.io/api/signup/activate-stripe-account/{user.Id}");
                });

            return new OkResult();
        }

        private async Task CreateStripeCustomerAsync(SponsorkitUser user, string email, CancellationToken cancellationToken)
        {
            var customer = await customerService.CreateAsync(
                new CustomerCreateOptions()
                {
                    Email = email
                },
                cancellationToken: cancellationToken);

            user.StripeCustomerId = customer.Id;
            await dataContext.SaveChangesAsync(cancellationToken);
        }

        private async Task CreateStripeAccountAsync(SponsorkitUser user, string email, CancellationToken cancellationToken)
        {
            var account = await accountService.CreateAsync(
                new AccountCreateOptions()
                {
                    Email = email,
                    Type = "standard"
                },
                cancellationToken: cancellationToken);

            user.StripeConnectId = account.Id;
            await dataContext.SaveChangesAsync(cancellationToken);
        }

        private async Task SendMailAsync(
            string emailAddress, 
            string title, 
            string content)
        {
            throw new NotImplementedException();
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
            var options = this.gitHubOptionsMonitor.CurrentValue;

            var tokenResponse = await gitHubClient.Oauth.CreateAccessToken(
                new OauthTokenRequest(
                    options.ClientId,
                    options.ClientSecret,
                    code));

            return
                tokenResponse?.AccessToken ??
                throw new InvalidOperationException("Could not get GitHub access token from authentication code.");
        }
    }
}
