using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Sponsorkit.BusinessLogic.Domain.Models.Database;

public class Bounty
{
    [Key]
    public Guid Id { get; set; }
        
    public DateTimeOffset CreatedAt { get; set; }

    public User Creator { get; set; } = null!;
    public Guid CreatorId { get; set; }
        
    public User? AwardedTo { get; set; }
    public Guid? AwardedToId { get; set; }

    public Issue Issue { get; set; } = null!;
    public Guid IssueId { get; set; }

    public List<BountyClaimRequest> ClaimRequests { get; set; } = new();

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
            .HasMany(x => x.ClaimRequests)
            .WithOne(x => x.Bounty)
            .HasForeignKey(x => x.BountyId)
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