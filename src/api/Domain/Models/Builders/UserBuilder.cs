using System;
using System.Collections.Generic;

namespace Sponsorkit.Domain.Models.Builders
{
    public class UserBuilder : ModelBuilder<User>
    {
        private Guid id;
        private byte[]? encryptedEmail;
        private string? stripeCustomerId;
        private string? stripeConnectId;
        private long? gitHubId;
        private byte[]? encryptedGitHubAccessToken;
        
        private List<Repository>? repositories;
        
        private List<Bounty>? createdBounties;
        private List<Bounty>? awardedBounties;

        private List<Sponsorship>? createdSponsorships;
        private List<Sponsorship>? awardedSponsorships;
        
        private DateTime createdAtUtc;
        
        public UserBuilder()
        {
            createdAtUtc = DateTime.UtcNow;
        }
        
        public override User Build()
        {
            if (encryptedEmail == null)
                throw new InvalidOperationException("E-mail must be specified.");

            if (stripeCustomerId == null)
                throw new InvalidOperationException("Stripe customer ID must be specified.");

            var user = new User()
            {
                Id = id,
                EncryptedEmail = encryptedEmail,
                StripeCustomerId = stripeCustomerId,
                StripeConnectId = stripeConnectId,
                GitHubId = gitHubId,
                CreatedAtUtc = createdAtUtc,
                Repositories = repositories ?? new List<Repository>(),
                AwardedBounties = awardedBounties ?? new List<Bounty>(),
                AwardedSponsorships = awardedSponsorships ?? new List<Sponsorship>(),
                CreatedBounties = createdBounties ?? new List<Bounty>(),
                CreatedSponsorships = createdSponsorships ?? new List<Sponsorship>(),
                EncryptedGitHubAccessToken = encryptedGitHubAccessToken
            };

            return user;
        }
    }
}