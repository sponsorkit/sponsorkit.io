using System;
using System.Collections.Generic;
using System.Linq;

namespace Sponsorkit.Domain.Models.Builders
{
    public class RepositoryBuilder : ModelBuilder<Repository>
    {
        private Guid id;

        private long? gitHubId;
        private User? owner;
        private List<Issue>? issues;
        private List<Sponsorship>? sponsorships;

        public RepositoryBuilder WithId(Guid id)
        {
            this.id = id;
            return this;
        }

        public RepositoryBuilder WithGitHubId(long gitHubId)
        {
            this.gitHubId = gitHubId;
            return this;
        }

        public RepositoryBuilder WithOwner(User owner)
        {
            this.owner = owner;
            return this;
        }

        public RepositoryBuilder WithIssues(params Issue[] issues)
        {
            this.issues = issues.ToList();
            return this;
        }

        public RepositoryBuilder WithSponsorships(params Sponsorship[] sponsorships)
        {
            this.sponsorships = sponsorships.ToList();
            return this;
        }

        public override Repository Build()
        {
            if (gitHubId == null)
                throw new InvalidOperationException("No GitHub ID was specified.");
            
            return new Repository()
            {
                Id = id,
                Owner = owner,
                Issues = issues ?? new List<Issue>(),
                Sponsorships = sponsorships ?? new List<Sponsorship>(),
                GitHubId = gitHubId.Value
            };
        }
    }
}