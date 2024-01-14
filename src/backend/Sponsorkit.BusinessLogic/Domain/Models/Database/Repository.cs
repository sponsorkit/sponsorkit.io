using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Sponsorkit.BusinessLogic.Domain.Models.Database;

public class Repository
{
    [Key]
    public Guid Id { get; set; }

    public RepositoryGitHubInformation GitHub { get; set; } = null!;

    public List<PullRequest> PullRequests { get; set; } = [];

    public User? Owner { get; set; }
    public Guid? OwnerId { get; set; }
        
    public List<Issue> Issues { get; set; } = [];
        
    /// <summary>
    /// The sponsorships that have been made on the basis of this repository.
    /// </summary>
    public List<Sponsorship> Sponsorships { get; set; } = [];
}

public class RepositoryGitHubInformation
{
    public long Id { get; set; }
    public string Name { get; set; } = null!;
    public string OwnerName { get; set; } = null!;
}
    
public class RepositoryConfiguration : IEntityTypeConfiguration<Repository>
{
    public void Configure(EntityTypeBuilder<Repository> builder)
    {
        builder.OwnsOne(x => x.GitHub);

        builder
            .HasMany(x => x.PullRequests)
            .WithOne(x => x.Repository)
            .HasForeignKey(x => x.RepositoryId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}