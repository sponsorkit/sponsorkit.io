using System;
using System.Threading.Tasks;
using AutoMapper;
using MediatR;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Models;
using Sponsorkit.Infrastructure;

namespace Sponsorkit.Domain.Api.Sponsors.SponsorsBeneficiaryGet
{
    public class SponsorsBeneficiaryGet
    {
        private readonly IMediator mediator;
        private readonly IMapper mapper;
        private readonly DataContext dataContext;

        public SponsorsBeneficiaryGet(
            IMediator mediator,
            IMapper mapper,
            DataContext dataContext)
        {
            this.mediator = mediator;
            this.mapper = mapper;
            this.dataContext = dataContext;
        }

        /// <summary>
        /// <see cref="http://localhost:7071/api/sponsors/681c2d58-7a3f-49fb-ada8-697c06708d32"/>
        /// </summary>
        [Function(nameof(SponsorsBeneficiaryGet))]
        public async Task<HttpResponseData?> Execute(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "sponsors/{beneficiary}")]
            HttpRequestData requestData,
            string beneficiary)
        {
            if (!Guid.TryParse(beneficiary, out var beneficiaryId))
                return await requestData.CreateBadRequestResponseAsync("Invalid beneficiary ID.");

            var user = await dataContext.Users.SingleOrDefaultAsync(x => x.Id == beneficiaryId);
            var response = new Response(user.Id)
            {
                GitHubId = user.GitHubId
            };
            
            return await requestData.CreateOkResponseAsync(response);
        }
    }
}
