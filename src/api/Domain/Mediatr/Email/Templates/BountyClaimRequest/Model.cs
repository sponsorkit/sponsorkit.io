using System;
using Sponsorkit.Domain.Models;

namespace Sponsorkit.Domain.Mediatr.Email.Templates.BountyClaimRequest
{
    public record Model(
        string VerdictUrl,
        string ClaimedByUsername) : IMailModel;
}