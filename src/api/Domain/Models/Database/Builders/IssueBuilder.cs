using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Sponsorkit.Domain.Models.Database.Builders;

public class IssueBuilder : AsyncModelBuilder<Issue>
{
    private Bounty[] bounties;
    private Repository? repository;
    private IssueGitHubInformation? gitHub;

    public IssueBuilder()
    {
        bounties = Array.Empty<Bounty>();
    }

    public IssueBuilder WithBounties(params Bounty[] bounties)
    {
        this.bounties = bounties;
        return this;
    }

    public IssueBuilder WithRepository(Repository repository)
    {
        this.repository = repository;
        return this;
    }

    public IssueBuilder WithGitHubInformation(
        long id,
        int number,
        string titleSnapshot)
    {
        this.gitHub = new IssueGitHubInformation()
        {
            Id = id,
            Number = number,
            TitleSnapshot = titleSnapshot
        };
        return this;
    }

    public override Task<Issue> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (gitHub == null)
            throw new InvalidOperationException("GitHub information was not set.");

        if (repository == null)
            throw new InvalidOperationException("Repository was not set.");
            
        return Task.FromResult(new Issue()
        {
            Bounties = bounties.ToList(),
            Repository = repository,
            GitHub = gitHub
        });
    }
}