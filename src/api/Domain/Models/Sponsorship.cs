using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace Sponsorkit.Domain.Models
{
    public class Sponsorship
    {
        [Key]
        public Guid Id { get; set; }

        public DateTime CreatedAtUtc { get; set; } = new DateTime();

        public string Reference { get; set; } = null!;

        public int? MonthlyAmountInHundreds { get; set; }

        public List<Payment> Payments { get; set; } = new List<Payment>();
        
        public User Beneficiary { get; set; } = null!;
        public Guid BeneficiaryId { get; set; }
        
        public User Sponsor { get; set; } = null!;
        public Guid SponsorId { get; set; }
    }
}