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

        private UserGitHubInformation? gitHub;
        
        private List<Repository>? repositories;
        
        private List<Bounty>? createdBounties;
        private List<Bounty>? awardedBounties;

        private List<Sponsorship>? createdSponsorships;
        private List<Sponsorship>? awardedSponsorships;
        
        private DateTimeOffset createdAtUtc;
        
        public UserBuilder()
        {
            createdAtUtc = DateTime.UtcNow;
        }

        public UserBuilder WithId(Guid id)
        {
            this.id = id;
            return this;
        }

        public UserBuilder WithEmail(byte[] encryptedEmail)
        {
            this.encryptedEmail = encryptedEmail;
            return this;
        }

        public UserBuilder WithStripeCustomerId(string stripeCustomerId)
        {
            this.stripeCustomerId = stripeCustomerId;
            return this;
        }

        public UserBuilder WithStripeConnectId(string stripeConnectId)
        {
            this.stripeConnectId = stripeConnectId;
            return this;
        }

        public UserBuilder WithGitHub(
            long gitHubId,
            string username,
            byte[] encryptedAccessToken)
        {
            gitHub = new UserGitHubInformation()
            {
                Id = gitHubId,
                EncryptedAccessToken = encryptedAccessToken,
                Username = username
            };
            return this;
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
                CreatedAtUtc = createdAtUtc,
                Repositories = repositories ?? new List<Repository>(),
                AwardedBounties = awardedBounties ?? new List<Bounty>(),
                AwardedSponsorships = awardedSponsorships ?? new List<Sponsorship>(),
                CreatedBounties = createdBounties ?? new List<Bounty>(),
                CreatedSponsorships = createdSponsorships ?? new List<Sponsorship>(),
                GitHub = gitHub
            };

            return user;
        }
    }
}