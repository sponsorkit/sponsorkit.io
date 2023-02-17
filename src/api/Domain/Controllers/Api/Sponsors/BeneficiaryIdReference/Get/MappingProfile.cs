using System.Linq;
using AutoMapper;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.Domain.Controllers.Api.Sponsors.BeneficiaryIdReference.Get.Models.Sponsor;

namespace Sponsorkit.Domain.Controllers.Api.Sponsors.BeneficiaryIdReference.Get;

public class MappingProfile : Profile
{
    public MappingProfile()
    {
        CreateMap<Sponsorship, SponsorResponse>()
            .ConvertUsing(x => new SponsorResponse(
                x.MonthlyAmountInHundreds,
                x.Payments.Sum(
                    p => p.AmountInHundreds),
                x.CreatedAt));
    }
}