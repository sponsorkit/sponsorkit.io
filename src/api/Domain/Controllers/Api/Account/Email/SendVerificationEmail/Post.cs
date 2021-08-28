using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Mediatr.Email;
using Sponsorkit.Domain.Mediatr.Email.Templates.VerifyEmailAddress;
using Sponsorkit.Infrastructure.AspNet;
using Sponsorkit.Infrastructure.Security.Jwt;

namespace Sponsorkit.Domain.Controllers.Api.Account.Email.SendVerificationEmail
{
    public record Request(
        string Email);
    
    public class Post : BaseAsyncEndpoint
        .WithRequest<Request>
        .WithoutResponse
    {
        private readonly IMediator mediator;
        private readonly ITokenFactory tokenFactory;

        public const string NewEmailJwtTokenKey = "newEmail";
        public const string EmailVerificationRole = "EmailVerification";

        public Post(
            IMediator mediator,
            ITokenFactory tokenFactory)
        {
            this.mediator = mediator;
            this.tokenFactory = tokenFactory;
        }
        
        [HttpPost("/account/email/send-verification-email")]
        public override async Task<ActionResult> HandleAsync([FromBody] Request request, CancellationToken cancellationToken = new CancellationToken())
        {
            var userId = User.GetRequiredId();
            
            var token = tokenFactory.Create(new[]
            {
                new Claim(
                    JwtRegisteredClaimNames.Sub, 
                    userId.ToString()),
                new Claim(
                    NewEmailJwtTokenKey, 
                    request.Email),
                new Claim(
                    ClaimTypes.Role,
                    EmailVerificationRole)
            });

            var verificationLink = LinkHelper.GetApiUrl($"/account/email/verify-email-token/{token}");
            
            await mediator.Send(
                new SendEmailCommand(
                    EmailSender.Sponsorkit,
                    request.Email,
                    "Verify your e-mail address",
                    "VerifyEmailAddress",
                    new Model(
                        verificationLink)),
                cancellationToken);

            return Ok();
        }
    }
}