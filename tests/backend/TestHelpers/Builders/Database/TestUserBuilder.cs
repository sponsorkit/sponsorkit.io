using System;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Builders;
using Sponsorkit.BusinessLogic.Domain.Models.Stripe;
using Sponsorkit.Tests.TestHelpers.Environments;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Builders.Database;

public class TestUserBuilder : UserBuilder
{
    private readonly IIntegrationTestEnvironment environment;

    private StripeCustomerBuilder stripeCustomerBuilder;
    private Customer stripeCustomer;

    private bool skipCustomerCreation;
    private DateTimeOffset? emailVerifiedAt;

    public TestUserBuilder(IIntegrationTestEnvironment environment) : base(environment.EncryptionHelper)
    {
        this.environment = environment;

        WithId(Guid.NewGuid());
        WithStripeCustomerId(string.Empty);
        WithEmail("integration-test@example.com");
        WithStripeCustomer(environment.Stripe.CustomerBuilder);
        WithGitHub(1337, "username", "access-token");
    }

    public TestUserBuilder WithStripeCustomer(StripeCustomerBuilder stripeCustomerBuilder)
    {
        this.stripeCustomerBuilder = stripeCustomerBuilder;
        return this;
    }

    public TestUserBuilder WithStripeCustomer(Customer customer)
    {
        stripeCustomer = customer;
        return this;
    }

    public TestUserBuilder WithoutGitHub()
    {
        GitHubId = null;
        GitHubUsername = null;
        GitHubAccessToken = null;

        return this;
    }

    public TestUserBuilder WithoutStripeCustomer()
    {
        skipCustomerCreation = true;
        return this;
    }

    public TestUserBuilder WithVerifiedEmail()
    {
        emailVerifiedAt = DateTimeOffset.UtcNow;
        return this;
    }

    public override async Task<User> BuildAsync(CancellationToken cancellationToken = default)
    {
        var user = await base.BuildAsync(cancellationToken);
        user.EmailVerifiedAt = emailVerifiedAt;

        if (!skipCustomerCreation)
        {
            stripeCustomer ??= await stripeCustomerBuilder
                .WithUser(user)
                .BuildAsync(cancellationToken);
            user.StripeCustomerId = stripeCustomer.Id;
            user.StripeConnectId = stripeCustomerBuilder.CreatedAccount?.Id;
        }

        var context = environment.Database.Context;
        await context.Users.AddAsync(user, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);

        return user;
    }
}