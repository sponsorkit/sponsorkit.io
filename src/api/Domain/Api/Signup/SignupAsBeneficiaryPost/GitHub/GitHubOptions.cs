using Destructurama.Attributed;

namespace Sponsorkit.Domain.Api.Signup.SignupAsBeneficiaryPost.GitHub
{
    public class GitHubOptions
    {
        [NotLogged]
        public string? ClientId { get; set; }

        [NotLogged]
        public string? ClientSecret { get; set; }
    }

}
