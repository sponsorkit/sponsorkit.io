using System;
using System.Linq;

namespace Sponsorkit.Domain.Models.Builders
{
    public class IssueBuilder : ModelBuilder<Issue>
    {
        private Bounty[] bounties;
        private Repository? repository;
        private long? gitHubId;

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

        public IssueBuilder WithGitHubId(long id)
        {
            this.gitHubId = id;
            return this;
        }
        
        public override Issue Build()
        {
            if (gitHubId == null)
                throw new InvalidOperationException("GitHub ID was not set.");

            if (repository == null)
                throw new InvalidOperationException("Repository was not set.");
            
            return new Issue()
            {
                Bounties = bounties.ToList(),
                Repository = repository,
                GitHubId = gitHubId.Value
            };
        }
    }
}