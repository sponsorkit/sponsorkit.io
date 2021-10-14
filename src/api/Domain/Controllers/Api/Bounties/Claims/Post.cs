using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Octokit;
using Serilog;
using Sponsorkit.Domain.Helpers;
using Sponsorkit.Domain.Mediatr.Email;
using Sponsorkit.Domain.Mediatr.Email.Templates.BountyClaimRequest;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Builders;
using Sponsorkit.Domain.Models.Context;
using Sponsorkit.Infrastructure.AspNet;
using Sponsorkit.Infrastructure.Security.Encryption;

namespace Sponsorkit.Domain.Controllers.Api.Bounties.Claims
{
    public record PostRequest(
        long GitHubIssueId,
        long GitHubPullRequestNumber);
    
    public class Post : BaseAsyncEndpoint
        .WithRequest<PostRequest>
        .WithoutResponse
    {
        private readonly DataContext dataContext;
        private readonly IMediator mediator;
        private readonly IAesEncryptionHelper aesEncryptionHelper;
        private readonly ILogger logger;
        private readonly IGitHubClient gitHubClient;

        public Post(
            DataContext dataContext,
            IMediator mediator,
            IAesEncryptionHelper aesEncryptionHelper,
            ILogger logger,
            IGitHubClient gitHubClient)
        {
            this.dataContext = dataContext;
            this.mediator = mediator;
            this.aesEncryptionHelper = aesEncryptionHelper;
            this.logger = logger;
            this.gitHubClient = gitHubClient;
        }

        [HttpPost("/bounties/claims")]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public override async Task<ActionResult> HandleAsync(PostRequest request, CancellationToken cancellationToken = new CancellationToken())
        {
            var issue = await dataContext.Issues
                .Include(x => x.Bounties).ThenInclude(x => x.Creator)
                .Include(x => x.Repository)
                .SingleOrDefaultAsync(
                    x => x.GitHub.Id == request.GitHubIssueId,
                    cancellationToken);
            if (issue == null)
                return NotFound("Issue not found.");

            var pullRequest = await gitHubClient.PullRequest.Get(
                issue.Repository.GitHub.Id,
                (int)request.GitHubPullRequestNumber);
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
                if (pullRequest.User.Id != user.GitHub?.Id)
                    return Unauthorized("The given pull request is not owned by the claimer.");

                var existingClaimRequest = user.BountyClaimRequests.SingleOrDefault();
                if (existingClaimRequest != null)
                    return BadRequest("An existing claim request exists for this bounty.");

                var databasePullRequest = new PullRequestBuilder()
                    .WithRepository(issue.Repository)
                    .WithGitHubInformation(
                        pullRequest.Id,
                        pullRequest.Number)
                    .Build();
                foreach (var bounty in issue.Bounties)
                {
                    var claimRequest = new BountyClaimRequestBuilder()
                        .WithBounty(bounty)
                        .WithCreator(user)
                        .WithPullRequest(databasePullRequest)
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

            await SendClaimRequestsToUserEmailsAsync(
                addedClaimRequests, 
                cancellationToken);

            return Ok();
        }

        private async Task SendClaimRequestsToUserEmailsAsync(
            ICollection<BountyClaimRequest> addedClaimRequests, 
            CancellationToken cancellationToken)
        {
            foreach (var claimRequest in addedClaimRequests)
            {
                var emailAddress = await aesEncryptionHelper.DecryptAsync(claimRequest.Bounty.Creator.EncryptedEmail);

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
}