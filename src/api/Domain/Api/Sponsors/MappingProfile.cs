using AutoMapper;
using Sponsorkit.Domain.Api.Sponsors.SponsorsBeneficiaryReferenceGet.Models;
using Sponsorkit.Domain.Queries.GetBeneficiaryStatistics;
using Sponsorkit.Domain.Queries.GetSponsorshipSummaries;

namespace Sponsorkit.Domain.Api.Sponsors
{
    public class MappingProfile : Profile
    {
        public MappingProfile()
        {
            CreateMap<GetSponsorshipSummaryResponse, SponsorResponse>()
                .ConvertUsing(x => new SponsorResponse(
                    x.Sponsorship.MonthlyAmountInHundreds,
                    x.TotalDonationsInHundreds,
                    x.Sponsorship.CreatedAtUtc));
            
            CreateMap<GetBeneficiaryStatisticsResponse, DonationsResponse>();
        }
    }
}