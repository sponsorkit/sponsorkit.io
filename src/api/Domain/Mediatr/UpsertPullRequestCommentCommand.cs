using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.Extensions.Options;
using Sponsorkit.Domain.Controllers.Api.Account.Signup.FromGitHub.GitHub;
using Sponsorkit.Infrastructure.Options.GitHub;

namespace Sponsorkit.Domain.Mediatr
{
    public record UpsertPullRequestCommentCommand(
        string OwnerName,
        string RepositoryName,
        long PullRequestNumber,
        string Text) : IRequest;
    
    public class UpsertPullRequestCommentCommandHandler : IRequestHandler<UpsertPullRequestCommentCommand>
    {
        private readonly IGitHubClientFactory gitHubClientFactory;
        private readonly IMediator mediator;
        private readonly IOptionsMonitor<GitHubOptions> gitHubOptions;

        public UpsertPullRequestCommentCommandHandler(
            IGitHubClientFactory gitHubClientFactory,
            IMediator mediator,
            IOptionsMonitor<GitHubOptions> gitHubOptions)
        {
            this.gitHubClientFactory = gitHubClientFactory;
            this.mediator = mediator;
            this.gitHubOptions = gitHubOptions;
        }

        public async Task<Unit> Handle(UpsertPullRequestCommentCommand request, CancellationToken cancellationToken)
        {
            var client = gitHubClientFactory.CreateClientFromOAuthAuthenticationToken(
                gitHubOptions.CurrentValue.BountyhuntBot.PersonalAccessToken);

            var pullRequest = await client.PullRequest.Get(
                request.OwnerName,
                request.RepositoryName,
                (int)request.PullRequestNumber);

            var headRepository = pullRequest.Base.Repository;

            var comments = await client
                .Issue
                .Comment
                .GetAllForIssue(
                    headRepository.Id, 
                    pullRequest.Number);

            var existingBotComment = comments.FirstOrDefault(x =>
                x.User.Id == gitHubOptions.CurrentValue.BountyhuntBot.UserId);

            var requestContent = request.Text;
            if (existingBotComment == null)
            {
                await client
                    .Issue
                    .Comment
                    .Create(
                        headRepository.Id, 
                        pullRequest.Number, 
                        requestContent);
            }
            else
            {
                await client
                    .Issue
                    .Comment
                    .Update(
                        headRepository.Id, 
                        existingBotComment.Id,
                        requestContent);
            }

            return Unit.Value;
        }
    }
}
