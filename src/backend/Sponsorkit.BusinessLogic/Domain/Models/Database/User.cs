using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

// ReSharper disable CollectionNeverUpdated.Global

namespace Sponsorkit.BusinessLogic.Domain.Models.Database;

public class User
{
    [Key]
    public Guid Id { get; set; }
        
    public byte[] EncryptedEmail { get; set; } = null!;
    public DateTimeOffset? EmailVerifiedAt { get; set; }

    public string StripeCustomerId { get; set; } = null!;

    public string? StripeConnectId { get; set; }

    public UserGitHubInformation? GitHub { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
        
    public List<Repository> Repositories { get; set; } = [];
        
    public List<Bounty> CreatedBounties { get; set; } = [];
        
    public List<BountyClaimRequest> BountyClaimRequests { get; set; } = [];

    public List<Sponsorship> CreatedSponsorships { get; set; } = [];
    public List<Sponsorship> AwardedSponsorships { get; set; } = [];
}

public class UserGitHubInformation
{
    public long Id { get; set; }

    public string Username { get; set; } = null!;

    public byte[] EncryptedAccessToken { get; set; } = null!;
}
    
public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.OwnsOne(x => x.GitHub);
            
        builder
            .HasMany(x => x.BountyClaimRequests)
            .WithOne(x => x.Creator)
            .HasForeignKey(x => x.CreatorId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}