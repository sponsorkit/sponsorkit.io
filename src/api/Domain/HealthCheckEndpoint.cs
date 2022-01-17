using Ardalis.ApiEndpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Sponsorkit.Domain;

public class HealthCheckEndpoint : EndpointBaseSync
    .WithoutRequest
    .WithoutResult
{
    [AllowAnonymous]
    [HttpGet("/health")]
    public override void Handle()
    {
    }
}