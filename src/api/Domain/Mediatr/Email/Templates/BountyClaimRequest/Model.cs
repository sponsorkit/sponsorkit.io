namespace Sponsorkit.Domain.Mediatr.Email.Templates.BountyClaimRequest
{
    public record Model(
        string VerdictUrl,
        string ClaimedByUsername) : IMailModel;
}