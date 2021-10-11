using System;

namespace Sponsorkit.Domain.Models.Builders
{
    public class PullRequestBuilder : ModelBuilder<PullRequest>
    {
        private PullRequestGitHubInformation? gitHub;
        private Repository? repository;

        public PullRequestBuilder WithGitHubInformation(
            long id,
            int number)
        {
            this.gitHub = new PullRequestGitHubInformation()
            {
                Id = id,
                Number = number
            };
            return this;
        }

        public PullRequestBuilder WithRepository(Repository repository)
        {
            this.repository = repository;
            return this;
        }
        
        public override PullRequest Build()
        {
            if (this.gitHub == null)
                throw new InvalidOperationException("GitHub information not set.");

            if (this.repository == null)
                throw new InvalidOperationException("Repository not set.");

            return new PullRequest()
            {
                GitHub = gitHub,
                Repository = repository
            };
        }
    }
}