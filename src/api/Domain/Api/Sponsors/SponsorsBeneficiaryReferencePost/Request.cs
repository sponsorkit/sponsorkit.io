namespace Sponsorkit.Domain.Api.Sponsors.SponsorsBeneficiaryReferencePost
{
    public class Request
    {
        public int? AmountInHundreds { get; set; }
        public string? Email { get; set; }
        public string? StripeCardId { get; set; }
    }
}