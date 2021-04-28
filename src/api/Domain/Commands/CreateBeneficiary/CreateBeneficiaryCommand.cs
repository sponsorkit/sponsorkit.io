using MediatR;

namespace Sponsorkit.Domain.Commands.CreateBeneficiary
{
    public class CreateBeneficiaryCommand : IRequest
    {
        public string Email { get; }
        public string GitHubUserId { get; }

        public CreateBeneficiaryCommand(
            string email,
            string gitHubUserId)
        {
            Email = email;
            GitHubUserId = gitHubUserId;
        }
    }
}