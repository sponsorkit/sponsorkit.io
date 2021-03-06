using System.Data;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.Result;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Octokit;
using Sponsorkit.Domain.Mediatr.Behaviors.Database;
using Sponsorkit.Domain.Models.Builders;
using Sponsorkit.Domain.Models.Context;
using Issue = Sponsorkit.Domain.Models.Issue;
using Repository = Sponsorkit.Domain.Models.Repository;

namespace Sponsorkit.Domain.Mediatr;

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
            return Result<Issue>.NotFound();

        var gitHubIssue = await gitHubClient.Issue.Get(
            request.OwnerName,
            request.RepositoryName,
            request.IssueNumber);
        if (gitHubIssue == null)
            return Result<Issue>.NotFound();

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

        var newIssue = new IssueBuilder()
            .WithGitHubInformation(
                gitHubIssue.Id,
                gitHubIssue.Number,
                gitHubIssue.Title)
            .WithRepository(repository)
            .Build();
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

        var newRepository = new RepositoryBuilder()
            .WithGitHubInformation(
                gitHubRepository.Id,
                gitHubRepository.Owner.Login, gitHubRepository.Name)
            .Build();
        await dataContext.Repositories.AddAsync(
            newRepository,
            cancellationToken);

        return newRepository;
    }
}