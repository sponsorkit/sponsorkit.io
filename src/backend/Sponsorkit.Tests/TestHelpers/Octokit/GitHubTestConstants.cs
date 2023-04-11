using System;

namespace Sponsorkit.Tests.TestHelpers.Octokit;

public class GitHubTestConstants
{
    public const int RepositoryId = 413480113;
    public const string RepositoryName = "playground";
    public const string RepositoryOwnerName = "sponsorkit";
    
    public static readonly TimeSpan ApiCreationThrottleDelay = TimeSpan.FromSeconds(5);
}