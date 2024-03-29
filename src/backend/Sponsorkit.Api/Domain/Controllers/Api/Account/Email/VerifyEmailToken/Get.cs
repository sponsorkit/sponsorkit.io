﻿using System;
using System.Data;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Sponsorkit.Api.Domain.Controllers.Api.Account.Email.SendVerificationEmail;
using Sponsorkit.BusinessLogic.Domain.Helpers;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Sponsorkit.BusinessLogic.Infrastructure.AspNet;
using Sponsorkit.BusinessLogic.Infrastructure.Options;
using Sponsorkit.BusinessLogic.Infrastructure.Security.Encryption;
using Sponsorkit.BusinessLogic.Infrastructure.Security.Jwt;
using Stripe;

namespace Sponsorkit.Api.Domain.Controllers.Api.Account.Email.VerifyEmailToken;

public record Request(
    [FromRoute] string Token,
    [FromQuery] Guid BroadcastId);
    
public class Get : EndpointBaseAsync
    .WithRequest<Request>
    .WithoutResult
{
    private readonly DataContext dataContext;
    private readonly CustomerService customerService;
    private readonly IEncryptionHelper encryptionHelper;
    private readonly IOptionsMonitor<JwtOptions> jwtOptionsMonitor;

    public Get(
        DataContext dataContext,
        CustomerService customerService,
        IEncryptionHelper encryptionHelper,
        IOptionsMonitor<JwtOptions> jwtOptionsMonitor)
    {
        this.dataContext = dataContext;
        this.customerService = customerService;
        this.encryptionHelper = encryptionHelper;
        this.jwtOptionsMonitor = jwtOptionsMonitor;
    }
        
    [HttpGet("account/email/verify-email-token/{Token}")]
    [AllowAnonymous]
    public override async Task<ActionResult> HandleAsync([FromRoute] Request request, CancellationToken cancellationToken = new())
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var principal = tokenHandler.ValidateToken(
            request.Token,
            JwtValidator.GetValidationParameters(
                jwtOptionsMonitor.CurrentValue,
                TimeSpan.FromDays(7)),
            out _);

        if (!principal.IsInRole(Post.EmailVerificationRole))
            return Unauthorized();

        var claim = principal.Claims.SingleOrDefault(x => x.Type == Post.NewEmailJwtTokenKey);
        if (claim == null)
            throw new InvalidOperationException("No email claim found.");

        var userId = principal.GetRequiredId();

        var newEmail = claim.Value;

        await dataContext.ExecuteInTransactionAsync(async () =>
        {
            var user = await dataContext.Users.SingleAsync(
                x => x.Id == userId,
                cancellationToken);
            user.EmailVerifiedAt = DateTimeOffset.UtcNow;
            user.EncryptedEmail = await encryptionHelper.EncryptAsync(newEmail);
            await dataContext.SaveChangesAsync(cancellationToken);

            await customerService.UpdateAsync(
                user.StripeCustomerId,
                new CustomerUpdateOptions()
                {
                    Email = newEmail
                },
                cancellationToken: CancellationToken.None);
        }, IsolationLevel.ReadCommitted);

        return RedirectPermanent(
            LinkHelper.GetLandingPageUrl("/landing/email/verification-success", request.BroadcastId));
    }
}