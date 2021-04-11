using System;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models;

namespace Sponsorkit.Domain.Queries.GetUserDetails
{
    public class GetUserDetailsQuery : IRequest<GetUserDetailsResponse?>
    {
        public Guid UserId { get; }

        public GetUserDetailsQuery(
            Guid userId)
        {
            UserId = userId;
        }
    }

    public class GetUserDetailsQueryHandler : IRequestHandler<GetUserDetailsQuery, GetUserDetailsResponse?>
    {
        private readonly DataContext _dataContext;

        public GetUserDetailsQueryHandler(
            DataContext dataContext)
        {
            _dataContext = dataContext;
        }
        
        public async Task<GetUserDetailsResponse?> Handle(GetUserDetailsQuery request, CancellationToken cancellationToken)
        {
            var user = await _dataContext.Users
                .SingleOrDefaultAsync(
                    x => x.Id == request.UserId,
                    cancellationToken);
            return new GetUserDetailsResponse(
                user.Id,
                user.Name)
            {
                GitHubId = user.GitHubId
            };
        }
    }
}