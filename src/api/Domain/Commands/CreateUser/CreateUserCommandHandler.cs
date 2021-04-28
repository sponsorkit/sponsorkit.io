using System;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Sponsorkit.Domain.Models;
using Stripe;

namespace Sponsorkit.Domain.Commands.CreateUser
{
    public class CreateUserCommandHandler : IRequestHandler<CreateUserCommand, User>
    {
        private readonly DataContext _dataContext;
        private readonly CustomerService _customerService;

        public CreateUserCommandHandler(
            DataContext dataContext,
            CustomerService customerService)
        {
            _dataContext = dataContext;
            _customerService = customerService;
        }
        
        public async Task<User> Handle(CreateUserCommand request, CancellationToken cancellationToken)
        {
            var user = new User()
            {
                EncryptedEmail = request.Email,
                CreatedAtUtc = DateTime.UtcNow
            };

            await _dataContext.Users.AddAsync(user, cancellationToken);
            await _dataContext.SaveChangesAsync(cancellationToken);

            return user;
        }
    }
}