namespace Sponsorkit.Domain.Models
{
    public class Identity
    {
        public string EncryptedEmail { get; set; } = null!;
        
        public string? EncryptedPassword { get; set; }
        public string? GitHubUserId { get; set; }

        public User Owner { get; set; } = null!;
    }
}