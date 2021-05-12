using System;
using System.Threading.Tasks;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Options;
using Octokit;
using Sponsorkit.Domain.Api.Signup.SignupAsBeneficiaryPost.Encryption;
using Sponsorkit.Domain.Api.Signup.SignupAsBeneficiaryPost.GitHub;
using Sponsorkit.Domain.Models;
using Sponsorkit.Infrastructure;
using Stripe;
using SponsorkitUser = Sponsorkit.Domain.Models.User;
using GitHubUser = Octokit.User;

namespace Sponsorkit.Domain.Api.Signup.SignupAsBeneficiaryPost
{
    //https://haacked.com/archive/2014/04/24/octokit-oauth/
    //https://contentlab.io/using-c-code-to-access-the-github-api/

    public class Function
    {
        private readonly IGitHubClientFactory gitHubClientFactory;
        private readonly IGitHubClient gitHubClient;
        private readonly IOptionsMonitor<GitHubOptions> gitHubOptionsMonitor;
        private readonly IAesEncryptionHelper aesEncryptionHelper;
        
        private readonly DataContext dataContext;
        
        private readonly CustomerService customerService;
        private readonly AccountService accountService;
        private readonly AccountLinkService accountLinkService;

        public Function(
            IGitHubClientFactory gitHubClientFactory,
            IGitHubClient gitHubClient,
            IOptionsMonitor<GitHubOptions> gitHubOptionsMonitor,
            IAesEncryptionHelper aesEncryptionHelper,
            DataContext dataContext,
            CustomerService customerService,
            AccountService accountService,
            AccountLinkService accountLinkService)
        {
            this.gitHubClientFactory = gitHubClientFactory;
            this.gitHubClient = gitHubClient;
            this.gitHubOptionsMonitor = gitHubOptionsMonitor;
            this.dataContext = dataContext;
            this.aesEncryptionHelper = aesEncryptionHelper;
            this.customerService = customerService;
            this.accountService = accountService;
            this.accountLinkService = accountLinkService;
        }

        /// <summary>
        /// <see cref="http://localhost:7071/api/signup/as-beneficiary"/>
        /// </summary>
        [Function(nameof(SignupAsBeneficiaryPost))]
        public async Task<HttpResponseData?> Execute(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "signup/as-beneficiary")]
            HttpRequestData requestData)
        {
            var request = await requestData.ReadFromJsonAsync<Request>();
            if (request == null)
                return await requestData.CreateBadRequestResponseAsync("Request data was incorrect.");

            var token = await ExchangeGitHubAuthenticationCodeForAccessTokenAsync(request.GitHubAuthenticationCode);
            var currentGitHubUser = await GetCurrentGitHubUserFromTokenAsync(token);
            
            var email = request.Email;

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
                    await dataContext.Users.AddAsync(user);
                    await dataContext.SaveChangesAsync();

                    var customer = await customerService.CreateAsync(
                        new CustomerCreateOptions()
                        {
                            Email = email
                        });
                    user.StripeCustomerId = customer.Id;
                    await dataContext.SaveChangesAsync();

                    var account = await accountService.CreateAsync(
                        new AccountCreateOptions()
                        {
                            Email = email,
                            Type = "standard"
                        });
                    user.StripeConnectId = account.Id;
                    await dataContext.SaveChangesAsync();

                    await SendMailAsync(
                        email,
                        "Fill in your information with Stripe",
                        $"Yada yada: https://sponsorkit.io/api/signup/activate-stripe-account/{user.Id}");
                });

            return await requestData.CreateOkResponseAsync();
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
