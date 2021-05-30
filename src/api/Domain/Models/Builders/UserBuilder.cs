using System;
using System.Collections.Generic;
using Sponsorkit.Domain.Api.Signup.AsBeneficiary.Encryption;

namespace Sponsorkit.Domain.Models.Builders
{
    public class UserBuilder : ModelBuilder<User>
    {
        private readonly IAesEncryptionHelper aesEncryptionHelper;
        private Guid id;
        
        private byte[]? encryptedEmail;
        private byte[]? encryptedPassword;
        
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
        
        public UserBuilder(
            IAesEncryptionHelper aesEncryptionHelper)
        {
            this.aesEncryptionHelper = aesEncryptionHelper;
            
            createdAtUtc = DateTime.UtcNow;
        }

        public UserBuilder WithId(Guid id)
        {
            this.id = id;
            return this;
        }

        public UserBuilder WithCredentials(
            byte[] encryptedEmail,
            byte[] encryptedPassword)
        {
            this.encryptedEmail = encryptedEmail;
            this.encryptedPassword = encryptedPassword;
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

        public UserBuilder WithGitHubCredentials(
            long gitHubId,
            byte[] encryptedAccessToken)
        {
            this.gitHubId = gitHubId;
            this.encryptedGitHubAccessToken = encryptedAccessToken;
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