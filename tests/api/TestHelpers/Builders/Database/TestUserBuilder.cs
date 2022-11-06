using System;
using Sponsorkit.Domain.Models.Database;
using Sponsorkit.Domain.Models.Database.Builders;

namespace Sponsorkit.Tests.TestHelpers.Builders.Database;

public class TestUserBuilder : UserBuilder
{
    public TestUserBuilder()
    {
        WithEmail(Array.Empty<byte>());
        WithStripeCustomerId("some-stripe-id");
    }
}