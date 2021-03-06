using System;

namespace Sponsorkit.Domain.Models.Builders;

public class UserBuilder : ModelBuilder<User>
{
    private Guid id;
        
    private byte[]? encryptedEmail;
        
    private string? stripeCustomerId;
    private string? stripeConnectId;

    private UserGitHubInformation? gitHub;
        
    private readonly DateTimeOffset createdAt;
        
    public UserBuilder()
    {
        createdAt = DateTimeOffset.UtcNow;
    }

    public UserBuilder WithId(Guid id)
    {
        this.id = id;
        return this;
    }

    public UserBuilder WithEmail(byte[] encryptedEmail)
    {
        this.encryptedEmail = encryptedEmail;
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
        long gitHubId,
        string username,
        byte[] encryptedAccessToken)
    {
        gitHub = new UserGitHubInformation()
        {
            Id = gitHubId,
            EncryptedAccessToken = encryptedAccessToken,
            Username = username
        };
        return this;
    }
        
    public override User Build()
    {
        if (encryptedEmail == null)
            throw new InvalidOperationException("E-mail must be specified.");

        if (stripeCustomerId == null)
            throw new InvalidOperationException("Stripe customer ID must be specified.");

        var user = new User()
        {
            Id = id,
            EncryptedEmail = encryptedEmail,
            StripeCustomerId = stripeCustomerId,
            StripeConnectId = stripeConnectId,
            CreatedAt = createdAt,
            GitHub = gitHub
        };

        return user;
    }
}