using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace Sponsorkit.Domain.Models
{
    public class Sponsorship
    {
        [Key]
        public Guid Id { get; init; }

        public DateTime CreatedAtUtc { get; init; } = new();

        /// <summary>
        /// The repository that this sponsorship is regarding.
        /// </summary>
        public Repository? Repository { get; init; }
        public Guid? RepositoryId { get; init; }

        public int? MonthlyAmountInHundreds { get; init; }
        
        public string Reference { get; init; } = null!;

        public List<Payment> Payments { get; init; } = new();
        
        public User Beneficiary { get; init; } = null!;
        public Guid BeneficiaryId { get; init; }
        
        public User Sponsor { get; init; } = null!;
        public Guid SponsorId { get; init; }
    }
}