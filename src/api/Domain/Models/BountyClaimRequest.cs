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
        
        public DateTimeOffset CreatedAtUtc { get; set; }
        
        public DateTimeOffset? ExpiredAtUtc { get; set; }
    }
    
    public class BountyClaimRequestConfiguration : IEntityTypeConfiguration<BountyClaimRequest>
    {
        public void Configure(EntityTypeBuilder<BountyClaimRequest> builder)
        {
            builder
                .HasOne(x => x.Bounty)
                .WithMany(x => x.ClaimRequests!)
                .HasForeignKey(x => x.Bounty)
                .OnDelete(DeleteBehavior.Restrict);
            
            builder
                .HasOne(x => x.Creator)
                .WithMany(x => x.BountyClaimRequests!)
                .HasForeignKey(x => x.Creator)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}