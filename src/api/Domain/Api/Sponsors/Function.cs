using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Sponsorkit.Domain.Api.Sponsors.Models;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Queries.GetSponsorshipByReference;

namespace Sponsorkit.Domain.Api.Sponsors
{
    public class Function
    {
        private readonly IMediator _mediator;

        public Function(
            IMediator mediator)
        {
            _mediator = mediator;
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
            var result = await _mediator.Send(
                new GetSponsorshipByReferenceQuery(
                    beneficiary,
                    reference),
                cancellationToken);
            
            return new OkObjectResult(
                new Response(
                    null!,
                    new SponsorsResponse(
                        new SponsorResponse(
                            result.User.Name,
                            result.Sponsorship.MonthlyAmountInHundreds,
                            result.TotalDonationsInHundreds,
                            result.Sponsorship.CreatedAtUtc),
                        null!)));
        }
    }
}
