using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Sponsorkit.Domain.Models
{
    public class Bounty
    {
        [Key]
        public Guid Id { get; set; }
        
        public long AmountInHundreds { get; set; }
        
        public DateTimeOffset CreatedAtUtc { get; set; }

        public User Creator { get; set; } = null!;
        public Guid CreatorId { get; set; }
        
        public User? AwardedTo { get; set; }
        public Guid? AwardedToId { get; set; }

        public Issue Issue { get; set; } = null!;
        public Guid IssueId { get; set; }

        public List<Payment> Payments { get; set; } = new();
    }
    
    public class BountyConfiguration : IEntityTypeConfiguration<Bounty>
    {
        public void Configure(EntityTypeBuilder<Bounty> builder)
        {
            builder
                .HasOne(x => x.Creator)
                .WithMany(x => x.CreatedBounties)
                .HasForeignKey(x => x.CreatorId)
                .OnDelete(DeleteBehavior.Restrict);

            builder
                .HasOne(x => x.AwardedTo)
                .WithMany(x => x!.AwardedBounties)
                .HasForeignKey(x => x.AwardedToId)
                .OnDelete(DeleteBehavior.Restrict);

            builder
                .HasMany(x => x.Payments)
                .WithOne(x => x.Bounty!)
                .HasForeignKey(x => x.BountyId)
                .OnDelete(DeleteBehavior.Restrict);
            
            builder
                .HasIndex(x => new
                {
                    x.CreatorId,
                    x.IssueId
                })
                .IsUnique();
        }
    }
}