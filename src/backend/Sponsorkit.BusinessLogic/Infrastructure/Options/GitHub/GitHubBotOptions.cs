﻿using System.Diagnostics.CodeAnalysis;
using Destructurama.Attributed;

namespace Sponsorkit.BusinessLogic.Infrastructure.Options.GitHub;

[ExcludeFromCodeCoverage]
public class GitHubBotOptions
{
    [NotLogged]
    public string PersonalAccessToken { get; set; } = null!;
        
    public long UserId { get; set; }
}