﻿using System;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Sponsorkit.Domain.Models
{
    public class Bounty
    {
        [Key]
        public Guid Id { get; set; }

        /// <summary>
        /// The ID of the webhook event that created this bounty. Bounties are always created from webhook calls from Stripe, despite being initiated by the user. This is because some forms of payment attempts require additional processing time.
        /// </summary>
        public string StripeEventId { get; set; } = null!;
        
        public long AmountInHundreds { get; set; }
        
        public DateTimeOffset CreatedAtUtc { get; set; }

        public User Creator { get; set; } = null!;
        public Guid CreatorId { get; set; }
        
        public User? AwardedTo { get; set; }
        public Guid? AwardedToId { get; set; }

        public Issue Issue { get; set; } = null!;
        public Guid IssueId { get; set; }

        public Payment? Payment { get; set; }
    }
    
    public class BountyConfiguration : IEntityTypeConfiguration<Bounty>
    {
        public void Configure(EntityTypeBuilder<Bounty> builder)
        {
            builder
                .HasOne(x => x.Creator)
                .WithMany(x => x.CreatedBounties)
                .HasForeignKey(x => x.CreatorId)
                .OnDelete(DeleteBehavior.NoAction);

            builder
                .HasOne(x => x.AwardedTo)
                .WithMany(x => x!.AwardedBounties)
                .HasForeignKey(x => x.AwardedToId)
                .OnDelete(DeleteBehavior.NoAction);
            
            builder
                .HasIndex(x => new
                {
                    x.CreatorId,
                    x.IssueId
                })
                .IsUnique();

            builder
                .HasIndex(x => x.StripeEventId)
                .IsUnique();
        }
    }
}