﻿using System;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.Domain.Models.Database;
using Sponsorkit.Domain.Models.Database.Builders;
using Sponsorkit.Domain.Models.Stripe;
using Sponsorkit.Tests.TestHelpers.Environments;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.TestHelpers.Builders.Database;

public class TestUserBuilder : UserBuilder
{
    private readonly IIntegrationTestEnvironment environment;

    public TestUserBuilder(IIntegrationTestEnvironment environment) : base(environment.EncryptionHelper)
    {
        this.environment = environment;

        WithStripeCustomerId(string.Empty);
        WithEmail("integration-test@example.com");
    }

    public override async Task<User> BuildAsync(CancellationToken cancellationToken = default)
    {
        var user = await base.BuildAsync(cancellationToken);

        var stripeCustomer = await environment.Stripe.CustomerBuilder
            .WithUser(user)
            .BuildAsync(cancellationToken);
        user.StripeCustomerId = stripeCustomer.Id;

        await environment.Database.WithoutCachingAsync(async context =>
        {
            await context.Users.AddAsync(user, cancellationToken);
            await context.SaveChangesAsync(cancellationToken);
        });

        return user;
    }
}