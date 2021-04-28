using System;
using System.Threading.Tasks;
using AutoMapper;
using MediatR;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Sponsorkit.Domain.Queries.GetUserDetails;
using Sponsorkit.Infrastructure;

namespace Sponsorkit.Domain.Api.Sponsors.SponsorsBeneficiaryGet
{
    public class SponsorsBeneficiaryGet
    {
        private readonly IMediator _mediator;
        private readonly IMapper _mapper;

        public SponsorsBeneficiaryGet(
            IMediator mediator,
            IMapper mapper)
        {
            _mediator = mediator;
            _mapper = mapper;
        }

        /// <summary>
        /// <see cref="http://localhost:7071/api/sponsors/681c2d58-7a3f-49fb-ada8-697c06708d32"/>
        /// </summary>
        [Function(nameof(SponsorsBeneficiaryGet))]
        public async Task<HttpResponseData?> Execute(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "sponsors/{beneficiary}")]
            HttpRequestData request,
            string beneficiary)
        {
            if (!Guid.TryParse(beneficiary, out var beneficiaryId))
                return await request.CreateBadRequestResponseAsync("Invalid beneficiary ID.");

            var details = await _mediator.Send(new GetUserDetailsQuery(beneficiaryId));
            return await request.CreateOkResponseAsync(details);
        }
    }
}
