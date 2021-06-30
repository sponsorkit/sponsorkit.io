using System.Diagnostics.CodeAnalysis;
using Destructurama.Attributed;

namespace Sponsorkit.Infrastructure.Options.GitHub
{
    [ExcludeFromCodeCoverage]
    public class GitHubBotOptions
    {
        [NotLogged]
        public string PersonalAccessToken { get; set; } = null!;
    }
}