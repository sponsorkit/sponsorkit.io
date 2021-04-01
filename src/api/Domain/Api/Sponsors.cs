using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace Sponsorkit.Domain.Api
{
    public class Sponsors
    {
        public class Request {}

        public class Response
        {
            /*
     {
        donations: {
            total: 123,
            monthly: 10
        },
        donors: {
            current: {
                name: "Jonathan",
                monthly: 5,
                started: <date>
            },
            byAmount: {
                most: [{
                    name: "Jonathan",
                    monthly: 5,
                    started: <date>
                }],
                least: [{
                    name: "Jonathan",
                    monthly: 5,
                    started: <date>
                }]
            },
            byDate: {
                latest: [{
                    name: "Jonathan",
                    monthly: 5,
                    started: <date>
                }],
                oldest: [{
                    name: "Jonathan",
                    monthly: 5,
                    started: <date>
                }]
            }
        }
    }
            */
        }

        [FunctionName("SponsorGet")]
        public IActionResult Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "sponsors/{beneficiary}/{token}")] 
            Request request,
            string beneficiary,
            string token)
        {
            
            
            return new OkObjectResult(new Response());
        }
    }
}
