namespace Sponsorkit.Domain.Api.Signup.SignupAsBeneficiaryPost
{
    public class Request
    {
        public string? Email { get; set; }
        public string? GitHubAuthenticationCode { get; set; }
    }
}