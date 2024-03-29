﻿using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Sponsorkit.BusinessLogic.Domain.Models.Database;

public class PullRequest
{
    [Key] 
    public Guid Id { get; set; }

    public PullRequestGitHubInformation GitHub { get; set; } = null!;

    public Repository Repository { get; set; } = null!;
    public Guid RepositoryId { get; set; }
}

public class PullRequestGitHubInformation
{
    public long Id { get; set; }
    public int Number { get; set; }
}
    
public class PullRequestConfiguration : IEntityTypeConfiguration<PullRequest>
{
    public void Configure(EntityTypeBuilder<PullRequest> builder)
    {
        builder.OwnsOne(x => x.GitHub);
    }
}