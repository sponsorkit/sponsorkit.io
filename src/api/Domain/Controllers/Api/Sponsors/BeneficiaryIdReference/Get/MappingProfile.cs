using System.Linq;
using AutoMapper;
using Sponsorkit.Domain.Controllers.Api.Sponsors.BeneficiaryIdReference.Get.Models.Sponsor;
using Sponsorkit.Domain.Models;

namespace Sponsorkit.Domain.Controllers.Api.Sponsors.BeneficiaryIdReference.Get
{
    public class MappingProfile : Profile
    {
        public MappingProfile()
        {
            CreateMap<Sponsorship, SponsorResponse>()
                .ConvertUsing(x => new SponsorResponse(
                    x.MonthlyAmountInHundreds,
                    x.Payments.Sum(
                        p => p.AmountInHundreds),
                    x.CreatedAtUtc));
        }
    }
}