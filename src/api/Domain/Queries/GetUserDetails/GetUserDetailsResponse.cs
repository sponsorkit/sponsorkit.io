using System;

namespace Sponsorkit.Domain.Queries.GetUserDetails
{
    public class GetUserDetailsResponse
    {
        public GetUserDetailsResponse(Guid id)
        {
            Id = id;
        }

        public Guid Id { get; }

        public string? GitHubId { get; set; }
    }
}