using System;
using System.Linq;

namespace Sponsorkit.Domain.Models.Builders
{
    public class IssueBuilder : ModelBuilder<Issue>
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
            int number)
        {
            this.gitHub = new IssueGitHubInformation()
            {
                Id = id,
                Number = number
            };
            return this;
        }
        
        public override Issue Build()
        {
            if (gitHub == null)
                throw new InvalidOperationException("GitHub information was not set.");

            if (repository == null)
                throw new InvalidOperationException("Repository was not set.");
            
            return new Issue()
            {
                Bounties = bounties.ToList(),
                Repository = repository,
                GitHub = gitHub
            };
        }
    }
}