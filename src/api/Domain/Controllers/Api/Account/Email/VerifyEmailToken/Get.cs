using System;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Sponsorkit.Domain.Controllers.Api.Account.Email.SendVerificationEmail;
using Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.Encryption;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;
using Sponsorkit.Infrastructure.Options;
using Stripe;

namespace Sponsorkit.Domain.Controllers.Api.Account.Email.VerifyEmailToken
{
    public record Request(
        string Token);
    
    public class Get : BaseAsyncEndpoint
        .WithRequest<Request>
        .WithoutResponse
    {
        private readonly DataContext dataContext;
        private readonly CustomerService customerService;
        private readonly IAesEncryptionHelper aesEncryptionHelper;
        private readonly IOptionsMonitor<JwtOptions> jwtOptionsMonitor;

        public Get(
            DataContext dataContext,
            CustomerService customerService,
            IAesEncryptionHelper aesEncryptionHelper,
            IOptionsMonitor<JwtOptions> jwtOptionsMonitor)
        {
            this.dataContext = dataContext;
            this.customerService = customerService;
            this.aesEncryptionHelper = aesEncryptionHelper;
            this.jwtOptionsMonitor = jwtOptionsMonitor;
        }
        
        [HttpGet("/account/email/verify-email-token/{token}")]
        [AllowAnonymous]
        public override async Task<ActionResult> HandleAsync([FromRoute] Request request, CancellationToken cancellationToken = new CancellationToken())
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var principal = tokenHandler.ValidateToken(
                request.Token,
                new TokenValidationParameters()
                {
                    ValidateAudience = true,
                    ValidAudience = "sponsorkit.io",
                    ValidateIssuer = true,
                    ValidIssuer = "sponsorkit.io",
                    IssuerSigningKey = new SymmetricSecurityKey(
                        Encoding.ASCII.GetBytes(jwtOptionsMonitor.CurrentValue.PrivateKey)),
                    ValidateLifetime = true
                },
                out _);

            if (!principal.IsInRole(Post.EmailVerificationRole))
                return Unauthorized();

            var claim = principal.Claims.SingleOrDefault(x => x.Type == Post.NewEmailJwtTokenKey);
            if(claim == null)
                return BadRequest("The given token does not contain the new e-mail address to change to.");

            var userId = principal.GetRequiredId();

            var newEmail = claim.Value;

            await dataContext.ExecuteInTransactionAsync(async () =>
            {
                var user = await dataContext.Users.SingleAsync(
                    x => x.Id == userId,
                    cancellationToken);
                user.EmailVerifiedAtUtc = DateTimeOffset.UtcNow;
                user.EncryptedEmail = await aesEncryptionHelper.EncryptAsync(newEmail);
                await dataContext.SaveChangesAsync(cancellationToken);

                await customerService.UpdateAsync(
                    user.StripeCustomerId,
                    new CustomerUpdateOptions()
                    {
                        Email = newEmail
                    },
                    cancellationToken: default);
            });

            return RedirectPermanent("https://sponsorkit.io/email/verification-success");
        }
    }
}