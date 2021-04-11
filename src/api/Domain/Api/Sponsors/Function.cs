using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AutoMapper;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Api.Sponsors.Models;
using Sponsorkit.Domain.Queries.GetBeneficiarySponsorshipSummaries;
using Sponsorkit.Domain.Queries.GetBeneficiarySponsorshipSummaryByReference;
using Sponsorkit.Domain.Queries.GetBeneficiaryStatistics;
using Sponsorkit.Domain.Queries.GetSponsorshipSummaries;

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
        /// <see cref="http://localhost:7071/api/sponsors/681c2d58-7a3f-49fb-ada8-697c06708d32/sponsorship-foo"/>
        /// </summary>
        [FunctionName("SponsorGet")]
        public async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "sponsors/{beneficiary}/{reference}")] 
            Request request,
            Guid beneficiary,
            string reference,
            CancellationToken cancellationToken)
        {
            const int amountToTake = 10;
            
            var currentSponsor = await _mediator.Send(
                new GetBeneficiarySponsorshipSummaryByReferenceQuery(
                    beneficiary,
                    reference),
                cancellationToken);

            var donationStatistics = await _mediator.Send(
                new GetBeneficiaryStatisticsQuery(beneficiary),
                cancellationToken);

            var leastAmountSponsors = await MapSponsorResponsesAsync(
                async () => await _mediator.Send(
                    new GetBeneficiarySponsorshipSummariesQuery(beneficiary)
                    {
                        Take = amountToTake,
                        Sort = new SummarySortOptions(
                            SummarySortProperty.ByAmount,
                            SortDirection.Ascending)
                    },
                    cancellationToken),
                cancellationToken);

            var mostAmountSponsors = await MapSponsorResponsesAsync(
                async () => await _mediator.Send(
                    new GetBeneficiarySponsorshipSummariesQuery(beneficiary)
                    {
                        Take = amountToTake,
                        Sort = new SummarySortOptions(
                            SummarySortProperty.ByAmount,
                            SortDirection.Descending)
                    },
                    cancellationToken),
                cancellationToken);

            var earliestSponsors = await MapSponsorResponsesAsync(
                async () => await _mediator.Send(
                    new GetBeneficiarySponsorshipSummariesQuery(beneficiary)
                    {
                        Take = amountToTake,
                        Sort = new SummarySortOptions(
                            SummarySortProperty.ByDate,
                            SortDirection.Ascending)
                    },
                    cancellationToken),
                cancellationToken);

            var latestSponsors = await MapSponsorResponsesAsync(
                async () => await _mediator.Send(
                    new GetBeneficiarySponsorshipSummariesQuery(beneficiary)
                    {
                        Take = amountToTake,
                        Sort = new SummarySortOptions(
                            SummarySortProperty.ByDate,
                            SortDirection.Descending)
                    },
                    cancellationToken),
                cancellationToken);
            
            return new OkObjectResult(
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
            Func<Task<IQueryable<GetSponsorshipSummaryResponse>>> summariesFactory,
            CancellationToken cancellationToken)
        {
            var summariesQueryable = await summariesFactory();
            var summariesArray = await summariesQueryable.ToArrayAsync(cancellationToken);
            return summariesArray
                .Select(MapSponsorResponse)
                .ToArray();
        }
    }
}
