using System;

namespace Sponsorkit.Domain.Queries.GetUserDetails
{
    public class GetUserDetailsResponse
    {
        public GetUserDetailsResponse(Guid id, string name)
        {
            Id = id;
            Name = name;
        }

        public Guid Id { get; }
        
        public string Name { get; }

        public string? GitHubId { get; set; }
    }
}