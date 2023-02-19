using System.Data;
using Ardalis.Result;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Octokit;
using Sponsorkit.BusinessLogic.Domain.Mediatr.Behaviors;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Builders;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using Issue = Sponsorkit.BusinessLogic.Domain.Models.Database.Issue;
using Repository = Sponsorkit.BusinessLogic.Domain.Models.Database.Repository;

namespace Sponsorkit.BusinessLogic.Domain.Mediatr.GitHub;

public record EnsureGitHubIssueInDatabaseCommand(
    string OwnerName,
    string RepositoryName,
    int IssueNumber) : IRequest<Result<Issue>>, IDatabaseTransactionRequest
{
    public IsolationLevel TransactionIsolationLevel => IsolationLevel.Serializable;
}

public class EnsureGitHubIssueInDatabaseCommandHandler : IRequestHandler<EnsureGitHubIssueInDatabaseCommand, Result<Issue>>
{
    private readonly DataContext dataContext;
    private readonly IGitHubClient gitHubClient;

    public EnsureGitHubIssueInDatabaseCommandHandler(
        DataContext dataContext,
        IGitHubClient gitHubClient)
    {
        this.dataContext = dataContext;
        this.gitHubClient = gitHubClient;
    }

    public async Task<Result<Issue>> Handle(EnsureGitHubIssueInDatabaseCommand request, CancellationToken cancellationToken)
    {
        var gitHubRepository = await gitHubClient.Repository.Get(
            request.OwnerName,
            request.RepositoryName);
        if (gitHubRepository == null)
            return Result<Issue>.NotFound("Repository not found.");

        var gitHubIssue = await gitHubClient.Issue.Get(
            request.OwnerName,
            request.RepositoryName,
            request.IssueNumber);
        if (gitHubIssue == null)
            return Result<Issue>.NotFound("Issue not found.");

        var repository = await EnsureRepositoryInDatabaseAsync(gitHubRepository, cancellationToken);
        var issue = await EnsureIssueInDatabaseAsync(gitHubIssue, repository, cancellationToken);

        await dataContext.SaveChangesAsync(cancellationToken);

        return issue;
    }

    private async Task<Issue> EnsureIssueInDatabaseAsync(
        Octokit.Issue gitHubIssue,
        Repository repository,
        CancellationToken cancellationToken)
    {
        var issue = await dataContext.Issues.SingleOrDefaultAsync(
            x => x.GitHub.Id == gitHubIssue.Id,
            cancellationToken);

        if (issue != null)
        {
            issue.GitHub.TitleSnapshot = gitHubIssue.Title;
            return issue;
        }

        var newIssue = await new IssueBuilder()
            .WithGitHubInformation(
                gitHubIssue.Id,
                gitHubIssue.Number,
                gitHubIssue.Title)
            .WithRepository(repository)
            .BuildAsync(cancellationToken);
        await dataContext.Issues.AddAsync(
            newIssue,
            cancellationToken);

        return newIssue;
    }

    private async Task<Repository> EnsureRepositoryInDatabaseAsync(
        Octokit.Repository gitHubRepository,
        CancellationToken cancellationToken)
    {
        var repository = await dataContext.Repositories.SingleOrDefaultAsync(
            x => x.GitHub.Id == gitHubRepository.Id,
            cancellationToken);
        if (repository != null)
            return repository;

        var newRepository = await new RepositoryBuilder()
            .WithGitHubInformation(
                gitHubRepository.Id,
                gitHubRepository.Owner.Login, 
                gitHubRepository.Name)
            .BuildAsync(cancellationToken);
        await dataContext.Repositories.AddAsync(
            newRepository,
            cancellationToken);

        return newRepository;
    }
}