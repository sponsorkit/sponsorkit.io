using System;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Infrastructure.Security.Encryption;

namespace Sponsorkit.Domain.Models.Database.Builders;

public class UserBuilder : AsyncModelBuilder<User>
{
    private readonly IEncryptionHelper encryptionHelper;

    private Guid id;

    private string? email;

    private string? stripeCustomerId;
    private string? stripeConnectId;

    private readonly DateTimeOffset createdAt;

    protected long? GitHubId;
    protected string? GitHubUsername;
    protected string? GitHubAccessToken;

    public UserBuilder(
        IEncryptionHelper encryptionHelper)
    {
        this.encryptionHelper = encryptionHelper;

        createdAt = DateTimeOffset.UtcNow;
    }

    public UserBuilder WithId(Guid id)
    {
        this.id = id;
        return this;
    }

    public UserBuilder WithEmail(string email)
    {
        this.email = email;
        return this;
    }

    public UserBuilder WithStripeCustomerId(string stripeCustomerId)
    {
        this.stripeCustomerId = stripeCustomerId;
        return this;
    }

    public UserBuilder WithStripeConnectId(string stripeConnectId)
    {
        this.stripeConnectId = stripeConnectId;
        return this;
    }

    public UserBuilder WithGitHub(
        long id,
        string username,
        string accessToken)
    {
        GitHubId = id;
        GitHubUsername = username;
        GitHubAccessToken = accessToken;
        return this;
    }

    public override async Task<User> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (email == null)
            throw new InvalidOperationException("E-mail must be specified.");

        if (stripeCustomerId == null)
            throw new InvalidOperationException("Stripe customer ID must be specified.");

        var gitHub = GitHubId != null && GitHubUsername != null && GitHubAccessToken != null
            ? new UserGitHubInformation()
            {
                Id = GitHubId.Value,
                Username = GitHubUsername,
                EncryptedAccessToken = await encryptionHelper.EncryptAsync(GitHubAccessToken)
            }
            : null;

        var user = new User()
        {
            Id = id,
            EncryptedEmail = await encryptionHelper.EncryptAsync(email),
            StripeCustomerId = stripeCustomerId,
            StripeConnectId = stripeConnectId,
            CreatedAt = createdAt,
            GitHub = gitHub
        };

        return user;
    }
}