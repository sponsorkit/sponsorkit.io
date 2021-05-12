using System;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using MediatR;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.Domain.Api.Sponsors.SponsorsBeneficiaryReferenceGet.Models;
using Sponsorkit.Domain.Api.Sponsors.SponsorsBeneficiaryReferenceGet.Models.Sponsor;
using Sponsorkit.Domain.Models;
using Sponsorkit.Infrastructure;

namespace Sponsorkit.Domain.Api.Sponsors.SponsorsBeneficiaryReferenceGet
{
    public class Function
    {
        private readonly IMediator mediator;
        private readonly IMapper mapper;
        private readonly DataContext dataContext;

        public Function(
            IMediator mediator,
            IMapper mapper,
            DataContext dataContext)
        {
            this.mediator = mediator;
            this.mapper = mapper;
            this.dataContext = dataContext;
        }

        /// <summary>
        /// <see cref="http://localhost:7071/api/sponsors/681c2d58-7a3f-49fb-ada8-697c06708d32/sponsorship-foo"/>
        /// </summary>
        [Function(nameof(SponsorsBeneficiaryReferenceGet))]
        public async Task<HttpResponseData> Execute(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "sponsors/{beneficiary}/{reference}")] 
            HttpRequestData request,
            string beneficiary,
            string reference)
        {
            if (!Guid.TryParse(beneficiary, out var beneficiaryId))
                return await request.CreateBadRequestResponseAsync("Invalid beneficiary ID.");
            
            var currentSponsor = await GetBeneficiarySponsorshipSummary(
                beneficiaryId,
                reference);

            var donationStatistics = await GetDonationsResponse();

            var leastAmountSponsors = await mapper
                .ProjectTo<SponsorResponse>(
                    TakeSomeBeneficiarySponsorshipSummaries(
                        beneficiaryId,
                        new SummarySortOptions(
                            SummarySortProperty.ByAmount,
                            SortDirection.Ascending)))
                .ToArrayAsync();

            var mostAmountSponsors = await mapper
                .ProjectTo<SponsorResponse>(
                    TakeSomeBeneficiarySponsorshipSummaries(
                        beneficiaryId,
                        new SummarySortOptions(
                            SummarySortProperty.ByAmount,
                            SortDirection.Descending)))
                .ToArrayAsync();

            var earliestSponsors = await mapper
                .ProjectTo<SponsorResponse>(
                    TakeSomeBeneficiarySponsorshipSummaries(
                        beneficiaryId,
                        new SummarySortOptions(
                            SummarySortProperty.ByDate,
                            SortDirection.Ascending)))
                .ToArrayAsync();

            var latestSponsors = await mapper
                .ProjectTo<SponsorResponse>(
                    TakeSomeBeneficiarySponsorshipSummaries(
                        beneficiaryId,
                        new SummarySortOptions(
                            SummarySortProperty.ByDate,
                            SortDirection.Descending)))
                .ToArrayAsync();

            return await request.CreateOkResponseAsync(
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
                    sponsorships.OrderBy(x => x.CreatedAtUtc) :
                property == SummarySortProperty.ByAmount ?
                    sponsorships.OrderByDescending(x => x.MonthlyAmountInHundreds) :
                    sponsorships.OrderByDescending(x => x.CreatedAtUtc);
        }
    }
}