using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using AutoMapper;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Api.Sponsors.Models;
using Sponsorkit.Domain.Queries.GetBeneficiarySponsorshipSummaries;
using Sponsorkit.Domain.Queries.GetBeneficiarySponsorshipSummaryByReference;
using Sponsorkit.Domain.Queries.GetBeneficiaryStatistics;
using Sponsorkit.Domain.Queries.GetSponsorshipSummaries;
using Sponsorkit.Domain.Queries.GetUserDetails;

namespace Sponsorkit.Domain.Api.Sponsors
{
    public class Function
    {
        private readonly IMediator _mediator;
        private readonly IMapper _mapper;

        public Function(
            IMediator mediator,
            IMapper mapper)
        {
            _mediator = mediator;
            _mapper = mapper;
        }

        /// <summary>
        /// <see cref="http://localhost:7071/api/sponsors/681c2d58-7a3f-49fb-ada8-697c06708d32"/>
        /// </summary>
        [Function("SponsorGet")]
        public async Task<HttpResponseData?> SponsorBeneficiaryGet(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "sponsors/{beneficiary}")]
            HttpRequestData request,
            string beneficiary)
        {
            if (!Guid.TryParse(beneficiary, out var beneficiaryId))
                throw new InvalidOperationException("Invalid beneficiary ID.");

            var details = await _mediator.Send(new GetUserDetailsQuery(beneficiaryId));

            var response = request.CreateResponse(HttpStatusCode.OK);
            await response.WriteAsJsonAsync(details);
            
            return response;
        }

        /// <summary>
        /// <see cref="http://localhost:7071/api/sponsors/681c2d58-7a3f-49fb-ada8-697c06708d32/sponsorship-foo"/>
        /// </summary>
        [Function("BeneficiaryReferenceGet")]
        public async Task<HttpResponseData> SponsorBeneficiaryReferenceGet(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "sponsors/{beneficiary}/{reference}")] 
            HttpRequestData request,
            string beneficiary,
            string reference)
        {
            if (!Guid.TryParse(beneficiary, out var beneficiaryId))
                throw new InvalidOperationException("Invalid beneficiary ID.");
            
            const int amountToTake = 10;
            
            var currentSponsor = await _mediator.Send(
                new GetBeneficiarySponsorshipSummaryByReferenceQuery(
                    beneficiaryId,
                    reference));

            var donationStatistics = await _mediator.Send(
                new GetBeneficiaryStatisticsQuery(beneficiaryId));

            var leastAmountSponsors = await MapSponsorResponsesAsync(
                async () => await _mediator.Send(
                    new GetBeneficiarySponsorshipSummariesQuery(beneficiaryId)
                    {
                        Take = amountToTake,
                        Sort = new SummarySortOptions(
                            SummarySortProperty.ByAmount,
                            SortDirection.Ascending)
                    }));

            var mostAmountSponsors = await MapSponsorResponsesAsync(
                async () => await _mediator.Send(
                    new GetBeneficiarySponsorshipSummariesQuery(beneficiaryId)
                    {
                        Take = amountToTake,
                        Sort = new SummarySortOptions(
                            SummarySortProperty.ByAmount,
                            SortDirection.Descending)
                    }));

            var earliestSponsors = await MapSponsorResponsesAsync(
                async () => await _mediator.Send(
                    new GetBeneficiarySponsorshipSummariesQuery(beneficiaryId)
                    {
                        Take = amountToTake,
                        Sort = new SummarySortOptions(
                            SummarySortProperty.ByDate,
                            SortDirection.Ascending)
                    }));

            var latestSponsors = await MapSponsorResponsesAsync(
                async () => await _mediator.Send(
                    new GetBeneficiarySponsorshipSummariesQuery(beneficiaryId)
                    {
                        Take = amountToTake,
                        Sort = new SummarySortOptions(
                            SummarySortProperty.ByDate,
                            SortDirection.Descending)
                    }));

            var response = request.CreateResponse(HttpStatusCode.OK);
            await response.WriteAsJsonAsync(
                new Response(
                    _mapper.Map<DonationsResponse>(donationStatistics),
                    new SponsorsResponse(
                        MapSponsorResponse(currentSponsor),
                        new SponsorsByAmountResponse(
                            mostAmountSponsors,
                            leastAmountSponsors),
                        new SponsorsByDateResponse(
                            latestSponsors,
                            earliestSponsors))));

            return response;
        }

        private SponsorResponse MapSponsorResponse(GetSponsorshipSummaryResponse summary)
        {
            return _mapper.Map<SponsorResponse>(summary);
        }

        private async Task<IEnumerable<SponsorResponse>> MapSponsorResponsesAsync(
            Func<Task<IQueryable<GetSponsorshipSummaryResponse>>> summariesFactory)
        {
            var summariesQueryable = await summariesFactory();
            var summariesArray = await summariesQueryable.ToArrayAsync();
            return summariesArray
                .Select(MapSponsorResponse)
                .ToArray();
        }
    }
}
