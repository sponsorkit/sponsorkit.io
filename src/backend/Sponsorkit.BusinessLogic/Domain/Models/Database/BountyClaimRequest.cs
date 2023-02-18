using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Sponsorkit.BusinessLogic.Domain.Models.Database;

public enum ClaimVerdict
{
    Undecided = 0,
    Solved = 1,
    Unsolved = 2,
    Scam = 3
}
    
public class BountyClaimRequest
{
    [Key]
    public Guid Id { get; set; }
        
    public Bounty Bounty { get; set; } = null!;
    public Guid BountyId { get; set; }

    public User Creator { get; set; } = null!;
    public Guid CreatorId { get; set; }

    public ClaimVerdict Verdict { get; set; }
    public DateTimeOffset? VerdictAt { get; set; }

    public PullRequest PullRequest { get; set; } = null!;
    public Guid PullRequestId { get; set; }
        
    public DateTimeOffset CreatedAt { get; set; }
        
    public DateTimeOffset? CompletedAt { get; set; }
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