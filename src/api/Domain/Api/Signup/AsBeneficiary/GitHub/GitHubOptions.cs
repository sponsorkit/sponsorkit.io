using Destructurama.Attributed;

namespace Sponsorkit.Domain.Api.Signup.AsBeneficiary.GitHub
{
    public class GitHubOptions
    {
        [NotLogged]
        public string? ClientId { get; init; }

        [NotLogged]
        public string? ClientSecret { get; init; }
    }

}
