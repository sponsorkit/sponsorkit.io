using MediatR;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Sponsorkit.BusinessLogic.Domain.Helpers;
using Sponsorkit.BusinessLogic.Infrastructure.GitHub;
using Sponsorkit.BusinessLogic.Infrastructure.Options.GitHub;

namespace Sponsorkit.BusinessLogic.Domain.Mediatr.GitHub;

public record UpsertIssueCommentCommand(
    string OwnerName,
    string RepositoryName,
    int IssueNumber,
    string Text) : IRequest;

public class UpsertIssueCommentCommandHandler : IRequestHandler<UpsertIssueCommentCommand>
{
    private readonly IGitHubClientFactory gitHubClientFactory;
    private readonly IOptionsMonitor<GitHubOptions> gitHubOptions;
    private readonly IHostEnvironment hostEnvironment;

    public UpsertIssueCommentCommandHandler(
        IGitHubClientFactory gitHubClientFactory,
        IOptionsMonitor<GitHubOptions> gitHubOptions,
        IHostEnvironment hostEnvironment)
    {
        this.gitHubClientFactory = gitHubClientFactory;
        this.gitHubOptions = gitHubOptions;
        this.hostEnvironment = hostEnvironment;
    }

    public async Task Handle(UpsertIssueCommentCommand request, CancellationToken cancellationToken)
    {
        if (!hostEnvironment.IsProduction() && request.OwnerName != "sponsorkit")
            return; 

        var client = gitHubClientFactory.CreateClientFromOAuthAuthenticationToken(
            gitHubOptions.CurrentValue.BountyhuntBot.PersonalAccessToken);

        var comments = await client
            .Issue
            .Comment
            .GetAllForIssue(
                request.OwnerName,
                request.RepositoryName,
                request.IssueNumber);

        var existingBotComment = comments.FirstOrDefault(x =>
            x.User.Id == gitHubOptions.CurrentValue.BountyhuntBot.UserId);

        var requestContent = request.Text;
        if (!hostEnvironment.IsProduction())
        {
            requestContent = $"{GitHubCommentHelper.RenderBold("Warning:")} This comment was posted with a dev version of Bountyhunt. This means that any bounties offered here are not real bounties that can be claimed with a production account.\n\n{requestContent}";
        }

        if (existingBotComment == null)
        {
            await client
                .Issue
                .Comment
                .Create(
                    request.OwnerName,
                    request.RepositoryName,
                    (int)request.IssueNumber,
                    requestContent);
        }
        else
        {
            await client
                .Issue
                .Comment
                .Update(
                    request.OwnerName,
                    request.RepositoryName,
                    existingBotComment.Id,
                    requestContent);
        }

        
    }
}