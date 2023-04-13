using System;
using System.Threading;
using System.Threading.Tasks;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Builders;
using Sponsorkit.BusinessLogic.Domain.Models.Stripe;
using Sponsorkit.BusinessLogic.Infrastructure;
using Sponsorkit.Tests.TestHelpers.Environments;
using Stripe;

namespace Sponsorkit.Tests.TestHelpers.Builders.Database;

public enum GitHubUserType
{
    SponsorkitBot,
    BountyhuntBot
}

public class TestUserBuilder : UserBuilder
{
    private readonly IIntegrationTestEnvironment environment;

    private StripeCustomerBuilder stripeCustomerBuilder;
    private Customer stripeCustomer;

    private bool skipCustomerCreation;
    private DateTimeOffset? emailVerifiedAt;

    private GitHubUserType? gitHubUserType;

    public TestUserBuilder(IIntegrationTestEnvironment environment) : base(environment.EncryptionHelper)
    {
        this.environment = environment;

        this.gitHubUserType = null;

        WithId(Guid.NewGuid());
        WithStripeCustomerId(string.Empty);
        WithEmail("integration-test@example.com");
        WithStripeCustomer(environment.Stripe.CustomerBuilder);
        WithGitHub(TestConstants.BountyhuntBotUserId, "bountyhunt-bot", "access-token");
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

    public TestUserBuilder WithGitHub(GitHubUserType type)
    {
        gitHubUserType = type;
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
        if (gitHubUserType != null)
        {
            var contextToUse = gitHubUserType switch
            {
                GitHubUserType.SponsorkitBot => environment.GitHub.SponsorkitBot,
                GitHubUserType.BountyhuntBot => environment.GitHub.BountyhuntBot,
                _ => throw new InvalidOperationException("Invalid GitHub user type.")
            };

            var gitHubUser = await contextToUse.RestClient.User.Current();
            WithGitHub(gitHubUser.Id, gitHubUser.Login, contextToUse.Options.PersonalAccessToken);
        }
        
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