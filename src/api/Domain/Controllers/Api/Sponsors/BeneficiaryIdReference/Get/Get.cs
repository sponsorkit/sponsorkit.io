using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Ardalis.ApiEndpoints;
using AutoMapper;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Controllers.Api.Sponsors.BeneficiaryIdReference.Get.Models;
using Sponsorkit.Domain.Controllers.Api.Sponsors.BeneficiaryIdReference.Get.Models.Sponsor;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Context;

namespace Sponsorkit.Domain.Controllers.Api.Sponsors.BeneficiaryIdReference.Get
{
    public record Request(
        [FromRoute] Guid BeneficiaryId,
        [FromRoute] string Reference);
    
    public record Response(
        DonationsResponse Donations,
        SponsorsResponse Sponsors);
    
    public class Get : BaseAsyncEndpoint
        .WithRequest<Request>
        .WithResponse<Response>
    {
        private readonly IMapper mapper;
        private readonly DataContext dataContext;

        public Get(
            IMapper mapper,
            DataContext dataContext)
        {
            this.mapper = mapper;
            this.dataContext = dataContext;
        }

        [HttpGet("/sponsors/{beneficiaryId}/{reference}")]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public override async Task<ActionResult<Response>> HandleAsync(Request request, CancellationToken cancellationToken = new CancellationToken())
        {
            var currentSponsor = await GetBeneficiarySponsorshipSummary(
                request.BeneficiaryId,
                request.Reference);

            var donationStatistics = await GetDonationsResponse();

            var leastAmountSponsors = await mapper
                .ProjectTo<SponsorResponse>(
                    TakeSomeBeneficiarySponsorshipSummaries(
                        request.BeneficiaryId,
                        new SummarySortOptions(
                            SummarySortProperty.ByAmount,
                            SortDirection.Ascending)))
                .ToArrayAsync(cancellationToken: cancellationToken);

            var mostAmountSponsors = await mapper
                .ProjectTo<SponsorResponse>(
                    TakeSomeBeneficiarySponsorshipSummaries(
                        request.BeneficiaryId,
                        new SummarySortOptions(
                            SummarySortProperty.ByAmount,
                            SortDirection.Descending)))
                .ToArrayAsync(cancellationToken: cancellationToken);

            var earliestSponsors = await mapper
                .ProjectTo<SponsorResponse>(
                    TakeSomeBeneficiarySponsorshipSummaries(
                        request.BeneficiaryId,
                        new SummarySortOptions(
                            SummarySortProperty.ByDate,
                            SortDirection.Ascending)))
                .ToArrayAsync(cancellationToken: cancellationToken);

            var latestSponsors = await mapper
                .ProjectTo<SponsorResponse>(
                    TakeSomeBeneficiarySponsorshipSummaries(
                        request.BeneficiaryId,
                        new SummarySortOptions(
                            SummarySortProperty.ByDate,
                            SortDirection.Descending)))
                .ToArrayAsync(cancellationToken: cancellationToken);

            return new OkObjectResult(
                new Response(
                    donationStatistics,
                    new SponsorsResponse(
                        mapper.Map<SponsorResponse>(currentSponsor),
                        new SponsorsByAmountResponse(
                            mostAmountSponsors,
                            leastAmountSponsors),
                        new SponsorsByDateResponse(
                            latestSponsors,
                            earliestSponsors))));
        }
        
        private async Task<DonationsResponse> GetDonationsResponse()
        {
            return await dataContext.Sponsorships
                .Include(x => x.Payments)
                .Select(x => new DonationsResponse(
                    x.Payments.Sum(p => p.AmountInHundreds),
                    x.MonthlyAmountInHundreds ?? 0))
                .SingleOrDefaultAsync();
        }

        private IQueryable<Sponsorship> TakeSomeBeneficiarySponsorshipSummaries(
            Guid beneficiaryId,
            SummarySortOptions? sortOptions = null)
        {
            var queryable = GetBeneficiarySponsorshipSummaries(beneficiaryId, sortOptions);
            return queryable.Take(10);
        }
        
        private async Task<Sponsorship> GetBeneficiarySponsorshipSummary(
            Guid beneficiaryId,
            string sponsorshipReferenceId)
        {
            var allSponsorships = GetBeneficiarySponsorshipSummaries(beneficiaryId);

            return await allSponsorships
                .Where(x => x.Reference == sponsorshipReferenceId)
                .SingleOrDefaultAsync();
        }

        private IQueryable<Sponsorship> GetBeneficiarySponsorshipSummaries(
            Guid beneficiaryId,
            SummarySortOptions? sortOptions = null)
        {
            var sponsorships = dataContext.Sponsorships
                .Include(x => x.Sponsor)
                .Include(x => x.Payments)
                .Where(x => x.BeneficiaryId == beneficiaryId);

            if (sortOptions == null) 
                return sponsorships;
            
            var sort = sortOptions.Value;
            
            var property = sort.Property;
            var direction = sort.Direction;
            
            return direction == SortDirection.Ascending ?
                property == SummarySortProperty.ByAmount ?
                    sponsorships.OrderBy(x => x.MonthlyAmountInHundreds) :
                    sponsorships.OrderBy(x => x.CreatedAt) :
                property == SummarySortProperty.ByAmount ?
                    sponsorships.OrderByDescending(x => x.MonthlyAmountInHundreds) :
                    sponsorships.OrderByDescending(x => x.CreatedAt);
        }
    }
}