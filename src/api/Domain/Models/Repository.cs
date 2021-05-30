using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace Sponsorkit.Domain.Models
{
    public class Repository
    {
        [Key]
        public Guid Id { get; init; }

        public long GitHubId { get; init; }
        
        public DateTime CreatedAtUtc { get; init; }
        
        public User? Owner { get; init; }
        public Guid? OwnerId { get; init; }
        
        public List<Issue> Issues { get; init; } = new();
        
        /// <summary>
        /// The sponsorships that have been made on the basis of this repository.
        /// </summary>
        public List<Sponsorship> Sponsorships { get; init; } = new();
    }
}