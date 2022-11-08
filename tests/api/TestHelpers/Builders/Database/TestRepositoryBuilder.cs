﻿using Sponsorkit.Domain.Models.Database.Builders;

namespace Sponsorkit.Tests.TestHelpers.Builders.Database;

public class TestRepositoryBuilder : RepositoryBuilder
{
    public TestRepositoryBuilder()
    {
        WithGitHubInformation(
            1337,
            "some-owner-name", 
            "some-name");
    }
}