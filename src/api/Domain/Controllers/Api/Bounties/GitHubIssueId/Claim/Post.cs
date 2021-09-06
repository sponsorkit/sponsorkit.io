﻿using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using System.Linq;
using Ardalis.ApiEndpoints;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Serilog;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Mediatr.Email;
using Sponsorkit.Domain.Mediatr.Email.Templates.BountyClaimRequest;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Builders;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;
using Sponsorkit.Infrastructure.Security.Encryption;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.GitHubIssueId.Claim
{
    public record PostRequest(
        [FromRoute] long GitHubIssueId);
    
    public class Post : BaseAsyncEndpoint
        .WithRequest<PostRequest>
        .WithoutResponse
    {
        private readonly DataContext dataContext;
        private readonly IMediator mediator;
        private readonly IAesEncryptionHelper aesEncryptionHelper;
        private readonly ILogger logger;

        public Post(
            DataContext dataContext,
            IMediator mediator,
            IAesEncryptionHelper aesEncryptionHelper,
            ILogger logger)
        {
            this.dataContext = dataContext;
            this.mediator = mediator;
            this.aesEncryptionHelper = aesEncryptionHelper;
            this.logger = logger;
        }

        [HttpPost("/bounties/{gitHubIssueId}/claim")]
        public override async Task<ActionResult> HandleAsync([FromRoute] PostRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            var issue = await dataContext.Issues
                .Include(x => x.Bounties)
                .ThenInclude(x => x.Creator)
                .SingleOrDefaultAsync(
                    x => x.GitHubId == request.GitHubIssueId,
                    cancellationToken);
            if (issue == null)
                return NotFound();

            var userId = User.GetRequiredId();

            var addedClaimRequests = new HashSet<BountyClaimRequest>();
            
            var result = await dataContext.ExecuteInTransactionAsync<ActionResult?>(async () =>
            {
                var user = await dataContext.Users
                    .AsQueryable()
                    .Include(x => x.BountyClaimRequests
                        .Where(b => b.Bounty.IssueId == issue.Id))
                    .SingleAsync(
                        x => x.Id == userId,
                        cancellationToken);

                var existingClaimRequest = user.BountyClaimRequests.SingleOrDefault();
                if (existingClaimRequest != null)
                    return BadRequest("An existing claim request exists for this bounty.");

                foreach (var bounty in issue.Bounties)
                {
                    var claimRequest = new BountyClaimRequestBuilder()
                        .WithBounty(bounty)
                        .WithCreator(user)
                        .Build();
                    user.BountyClaimRequests.Add(claimRequest);
                    bounty.ClaimRequests.Add(claimRequest);

                    addedClaimRequests.Add(claimRequest);
                }

                await dataContext.SaveChangesAsync(cancellationToken);

                return null;
            });

            if (result != null)
                return result;

            foreach (var claimRequest in addedClaimRequests)
            {
                var emailAddress = await aesEncryptionHelper.DecryptAsync(claimRequest.Bounty.Creator.EncryptedEmail);
                
                var userGitHubInformation = claimRequest.Creator.GitHub;
                if (userGitHubInformation == null)
                    throw new InvalidOperationException("Creator GitHub information could not be found.");

                var verdictUrl = LinkHelper.GetApiUrl($"/bounties/{issue.GitHubId}/claim/{claimRequest.Id}");
                await mediator.Send(
                    new SendEmailCommand(
                        EmailSender.Bountyhunt,
                        emailAddress,
                        "Someone wants to claim your bounty",
                        "BountyClaimRequest",
                        new Model(
                            verdictUrl,
                            userGitHubInformation.Username)),
                    cancellationToken);
            }

            return Ok();
        }
    }
}