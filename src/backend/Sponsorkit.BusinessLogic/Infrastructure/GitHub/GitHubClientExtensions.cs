using Octokit;

namespace Sponsorkit.BusinessLogic.Infrastructure.GitHub;

public static class GitHubClientExtensions
{
    public static async Task<TResponse?> TransformNotFoundErrorToNullResult<TResponse>(
        this IGitHubClient client,
        Func<IGitHubClient, Task<TResponse>> task)
        where TResponse : class
    {
        try
        {
            return await task(client);
        }
        catch (NotFoundException)
        {
            return null;
        }
    }
}