﻿using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Octokit;
using Sponsorkit.BusinessLogic.Domain.Helpers;
using Sponsorkit.BusinessLogic.Domain.Mediatr.Email;
using Sponsorkit.BusinessLogic.Domain.Mediatr.Email.Templates.BountyClaimRequest;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Builders;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Sponsorkit.BusinessLogic.Infrastructure.AspNet;
using Sponsorkit.BusinessLogic.Infrastructure.GitHub;
using Sponsorkit.BusinessLogic.Infrastructure.Security.Encryption;

namespace Sponsorkit.Api.Domain.Controllers.Api.Bounties.Claims;

public record ClaimsRequest(
    long GitHubIssueId,
    long GitHubPullRequestNumber);
    
public class ClaimsPost : EndpointBaseAsync
    .WithRequest<ClaimsRequest>
    .WithoutResult
{
    private readonly DataContext dataContext;
    private readonly IMediator mediator;
    private readonly IEncryptionHelper encryptionHelper;
    private readonly IGitHubClient gitHubClient;

    public ClaimsPost(
        DataContext dataContext,
        IMediator mediator,
        IEncryptionHelper encryptionHelper,
        IGitHubClient gitHubClient)
    {
        this.dataContext = dataContext;
        this.mediator = mediator;
        this.encryptionHelper = encryptionHelper;
        this.gitHubClient = gitHubClient;
    }

    [HttpPost("bounties/claims")]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public override async Task<ActionResult> HandleAsync(ClaimsRequest request, CancellationToken cancellationToken = new())
    {
        var issue = await dataContext.Issues
            .Include(x => x.Bounties).ThenInclude(x => x.Creator)
            .Include(x => x.Repository)
            .SingleOrDefaultAsync(
                x => x.GitHub.Id == request.GitHubIssueId,
                cancellationToken);
        if (issue == null)
            return NotFound("Issue not found.");

        var pullRequest = await gitHubClient.TransformNotFoundErrorToNullResult(async client => await client.PullRequest.Get(
            issue.Repository.GitHub.Id,
            (int)request.GitHubPullRequestNumber));
        if (pullRequest == null)
            return NotFound("Invalid pull request specified.");
            
        var addedClaimRequests = new HashSet<BountyClaimRequest>();
        var userId = User.GetRequiredId();
            
        var result = await dataContext.ExecuteInTransactionAsync<ActionResult?>(async () =>
        {
            var user = await dataContext.Users
                .AsQueryable()
                .Include(x => x.BountyClaimRequests
                    .Where(b => b.Bounty.IssueId == issue.Id))
                .ThenInclude(x => x.PullRequest)
                .SingleAsync(
                    x => x.Id == userId,
                    cancellationToken);
            if(user.GitHub == null)
                return Unauthorized("User must be linked to GitHub.");
                    
            if (pullRequest.User.Id != user.GitHub?.Id)
                return Unauthorized("The given pull request is not owned by the claimer.");

            var existingClaimRequest = user.BountyClaimRequests.SingleOrDefault();
            if (existingClaimRequest != null)
                return BadRequest("An existing claim request exists for this bounty.");

            var databasePullRequest = await new PullRequestBuilder()
                .WithRepository(issue.Repository)
                .WithGitHubInformation(
                    pullRequest.Id,
                    pullRequest.Number)
                .BuildAsync(cancellationToken);
            foreach (var bounty in issue.Bounties)
            {
                var claimRequest = await new BountyClaimRequestBuilder()
                    .WithBounty(bounty)
                    .WithCreator(user)
                    .WithPullRequest(databasePullRequest)
                    .BuildAsync(cancellationToken);
                user.BountyClaimRequests.Add(claimRequest);
                bounty.ClaimRequests.Add(claimRequest);

                addedClaimRequests.Add(claimRequest);

                await dataContext.SaveChangesAsync(cancellationToken);
            }

            return null;
        }, IsolationLevel.Serializable);

        if (result != null)
            return result;

        await SendClaimRequestsToUserEmailsAsync(
            addedClaimRequests, 
            CancellationToken.None);

        return Ok();
    }

    private async Task SendClaimRequestsToUserEmailsAsync(
        ICollection<BountyClaimRequest> addedClaimRequests, 
        CancellationToken cancellationToken)
    {
        foreach (var claimRequest in addedClaimRequests)
        {
            var emailAddress = await encryptionHelper.DecryptAsync(claimRequest.Bounty.Creator.EncryptedEmail);

            var userGitHubInformation = claimRequest.Creator.GitHub;
            if (userGitHubInformation == null)
                throw new InvalidOperationException("Creator GitHub information could not be found.");

            var verdictUrl = LinkHelper.GetWebUrl($"/bounties/claims/verdict?claimId={claimRequest.Id}");
            await mediator.Send(
                new SendEmailCommand(
                    EmailSender.Bountyhunt,
                    emailAddress,
                    "Someone wants to claim your bounty",
                    TemplateDirectory.BountyClaimRequest,
                    new Model(
                        verdictUrl,
                        userGitHubInformation.Username)),
                cancellationToken);
        }
    }
}