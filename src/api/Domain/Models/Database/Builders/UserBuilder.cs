﻿using System;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Domain.Models.Stripe;
using Sponsorkit.Infrastructure.Security.Encryption;

namespace Sponsorkit.Domain.Models.Database.Builders;

public class UserBuilder : AsyncModelBuilder<User>
{
    private readonly IAesEncryptionHelper encryptionHelper;

    private Guid id;

    private string? email;

    private string? stripeCustomerId;
    private string? stripeConnectId;

    private readonly DateTimeOffset createdAt;

    private long? gitHubId;
    private string? gitHubUsername;
    private string? gitHubAccessToken;

    public UserBuilder(
        IAesEncryptionHelper encryptionHelper)
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
        gitHubId = id;
        gitHubUsername = username;
        gitHubAccessToken = accessToken;
        return this;
    }

    public override async Task<User> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (email == null)
            throw new InvalidOperationException("E-mail must be specified.");

        if (stripeCustomerId == null)
            throw new InvalidOperationException("Stripe customer ID must be specified.");

        var gitHub = gitHubId != null && gitHubUsername != null && gitHubAccessToken != null
            ? new UserGitHubInformation()
            {
                Id = gitHubId.Value,
                Username = gitHubUsername,
                EncryptedAccessToken = await encryptionHelper.EncryptAsync(gitHubAccessToken)
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