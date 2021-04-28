using MediatR;
using Sponsorkit.Domain.Models;

namespace Sponsorkit.Domain.Commands.CreateUser
{
    public class CreateUserCommand : IRequest<User>
    {
        public string Email { get; }

        public CreateUserCommand(string email)
        {
            Email = email;
        }
    }
}