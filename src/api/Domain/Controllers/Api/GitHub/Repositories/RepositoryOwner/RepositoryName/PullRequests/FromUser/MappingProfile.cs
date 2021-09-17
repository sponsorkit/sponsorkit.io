using AutoMapper;
using PullRequest = Octokit.PullRequest;

namespace Sponsorkit.Domain.Controllers.Api.GitHub.Repositories.RepositoryOwner.RepositoryName.PullRequests.FromUser
{
    public class MappingProfile : Profile
    {
        public MappingProfile()
        {
            CreateMap<PullRequest, PullRequestResponse>()
                .ConvertUsing(x => new PullRequestResponse(
                    x.Number,
                    x.Title,
                    x.MergedAt,
                    x.State.Value));
        }
    }
}