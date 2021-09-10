using System;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Sponsorkit.Domain.Models
{
    public enum ClaimVerdict
    {
        Solved,
        Unsolved,
        Scam
    }
    
    public class BountyClaimRequest
    {
        [Key]
        public Guid Id { get; set; }
        
        public Bounty Bounty { get; set; } = null!;
        public Guid BountyId { get; set; }

        public User Creator { get; set; } = null!;
        public Guid CreatorId { get; set; }

        public ClaimVerdict? Verdict { get; set; }
        public DateTimeOffset? VerdictAtUtc { get; set; }

        public PullRequest PullRequest { get; set; } = null!;
        public Guid PullRequestId { get; set; }
        
        public DateTimeOffset CreatedAtUtc { get; set; }
        
        public DateTimeOffset? ExpiredAtUtc { get; set; }
    }
    
    public class BountyClaimRequestConfiguration : IEntityTypeConfiguration<BountyClaimRequest>
    {
        public void Configure(EntityTypeBuilder<BountyClaimRequest> builder)
        {
            builder
                .HasIndex(x => new
                {
                    x.BountyId,
                    x.CreatorId
                })
                .IsUnique();
        }
    }
}