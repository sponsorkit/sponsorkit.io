using System;

namespace Sponsorkit.Domain.Api.Sponsors.SponsorsBeneficiaryGet
{
    public class Response
    {
        public Response(Guid id)
        {
            Id = id;
        }
        
        public Guid Id { get; }
        
        public long? GitHubId { get; set; }
    }
}