﻿using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Sponsorkit.BusinessLogic.Domain.Models.Database;

public class Issue
{
    [Key]
    public Guid Id { get; set; }

    public IssueGitHubInformation GitHub { get; set; } = null!;

    public Repository Repository { get; set; } = null!;

    public List<Bounty> Bounties { get; set; } = [];
}

public class IssueGitHubInformation
{
    public long Id { get; set; }
    public int Number { get; set; }

    public string TitleSnapshot { get; set; } = null!;

    public DateTimeOffset? ClosedAt;
}
    
public class IssueConfiguration : IEntityTypeConfiguration<Issue>
{
    public void Configure(EntityTypeBuilder<Issue> builder)
    {
        builder.OwnsOne(x => x.GitHub);
    }
}