using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using MediatR;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Api.Sponsors.SponsorsBeneficiaryReferenceGet.Models;
using Sponsorkit.Domain.Queries.GetBeneficiarySponsorshipSummaries;
using Sponsorkit.Domain.Queries.GetBeneficiarySponsorshipSummaryByReference;
using Sponsorkit.Domain.Queries.GetBeneficiaryStatistics;
using Sponsorkit.Domain.Queries.GetSponsorshipSummaries;
using Sponsorkit.Infrastructure;

namespace Sponsorkit.Domain.Api.Sponsors.SponsorsBeneficiaryReferenceGet
{
    public class SponsorBeneficiaryReferenceGet
    {
        private readonly IMediator _mediator;
        private readonly IMapper _mapper;

        public SponsorBeneficiaryReferenceGet(
            IMediator mediator,
            IMapper mapper)
        {
            _mediator = mediator;
            _mapper = mapper;
        }

        /// <summary>
        /// <see cref="http://localhost:7071/api/sponsors/681c2d58-7a3f-49fb-ada8-697c06708d32/sponsorship-foo"/>
        /// </summary>
        [Function(nameof(SponsorBeneficiaryReferenceGet))]
        public async Task<HttpResponseData> Execute(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "sponsors/{beneficiary}/{reference}")] 
            HttpRequestData request,
            string beneficiary,
            string reference)
        {
            if (!Guid.TryParse(beneficiary, out var beneficiaryId))
                return await request.CreateBadRequestResponseAsync("Invalid beneficiary ID.");
            
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

            return await request.CreateOkResponseAsync(
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
