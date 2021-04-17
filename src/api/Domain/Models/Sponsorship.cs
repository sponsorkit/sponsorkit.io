using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace Sponsorkit.Domain.Models
{
    public class Sponsorship
    {
        [Key]
        public Guid Id { get; set; }

        public DateTime CreatedAtUtc { get; set; } = new();

        /// <summary>
        /// The repository that this sponsorship is regarding.
        /// </summary>
        public Repository? Repository { get; set; }
        public Guid? RepositoryId { get; set; }

        public int? MonthlyAmountInHundreds { get; set; }

        public List<Payment> Payments { get; set; } = new();
        
        public User Beneficiary { get; set; } = null!;
        public Guid BeneficiaryId { get; set; }
        
        public User Sponsor { get; set; } = null!;
        public Guid SponsorId { get; set; }
    }
}