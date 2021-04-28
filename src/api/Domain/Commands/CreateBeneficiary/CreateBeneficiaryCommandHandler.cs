using System;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Sponsorkit.Domain.Commands.CreateUser;
using Sponsorkit.Domain.Models;
using Stripe;

namespace Sponsorkit.Domain.Commands.CreateBeneficiary
{
    public class CreateBeneficiaryCommandHandler : IRequestHandler<CreateBeneficiaryCommand>
    {
        private readonly IMediator _mediator;
        
        private readonly DataContext _dataContext;
        private readonly CustomerService _customerService;

        public CreateBeneficiaryCommandHandler(
            IMediator mediator,
            DataContext dataContext,
            CustomerService customerService)
        {
            _mediator = mediator;
            _dataContext = dataContext;
            _customerService = customerService;
        }
        
        public async Task<Unit> Handle(CreateBeneficiaryCommand request, CancellationToken cancellationToken)
        {
            var user = await _mediator.Send(
                new CreateUserCommand(request.Email),
                cancellationToken);
            user.GitHubId = request.GitHubUserId;

            await _dataContext.SaveChangesAsync(cancellationToken);

            var customer = await _customerService.CreateAsync(
                new CustomerCreateOptions()
                {
                    Email = request.Email
                },
                default,
                cancellationToken);
            user.StripeCustomerId = customer.Id;
            
            await _dataContext.SaveChangesAsync(cancellationToken);

            return Unit.Value;
        }
    }
}