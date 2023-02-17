using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Sponsorkit.BusinessLogic.Domain.Models.Database;

[SuppressMessage("ReSharper", "NullableWarningSuppressionIsUsed")]
public class Sponsorship
{
    [Key]
    public Guid Id { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>
    /// The repository that this sponsorship is regarding.
    /// </summary>
    public Repository? Repository { get; set; }
    public Guid? RepositoryId { get; set; }

    public long? MonthlyAmountInHundreds { get; set; }
        
    public string Reference { get; set; } = null!;

    public List<Payment> Payments { get; set; } = new();
        
    public User Beneficiary { get; set; } = null!;
    public Guid BeneficiaryId { get; set; }
        
    public User Sponsor { get; set; } = null!;
    public Guid SponsorId { get; set; }
}
    
public class SponsorshipConfiguration : IEntityTypeConfiguration<Sponsorship>
{
    public void Configure(EntityTypeBuilder<Sponsorship> builder)
    {
        builder
            .HasOne(x => x.Beneficiary)
            .WithMany(x => x.AwardedSponsorships)
            .HasForeignKey(x => x.BeneficiaryId)
            .OnDelete(DeleteBehavior.Restrict);
                
        builder
            .HasOne(x => x.Sponsor)
            .WithMany(x => x.CreatedSponsorships)
            .HasForeignKey(x => x.SponsorId)
            .OnDelete(DeleteBehavior.Restrict);

        builder
            .HasOne(x => x.Repository)
            .WithMany(x => x.Sponsorships)
            .HasForeignKey(x => x.SponsorId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}