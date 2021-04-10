using System.Collections.Generic;

namespace Sponsorkit.Domain.Models
{
    public class Sponsorship
    {
        public int? MonthlyAmountInHundreds { get; set; }

        public List<Payment> Payments { get; set; } = new List<Payment>();
        
        public User Beneficiary { get; set; } = null!;
        public User Sponsor { get; set; } = null!;
    }
}