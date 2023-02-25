using System.Diagnostics.CodeAnalysis;
using Destructurama.Attributed;

namespace Sponsorkit.BusinessLogic.Infrastructure.Options.GitHub;

[ExcludeFromCodeCoverage]
public class GitHubOAuthOptions
{
    [NotLogged]
    public string ClientId { get; set; } = null!;
        
    [NotLogged]
    public string ClientSecret { get; set; } = null!;
}