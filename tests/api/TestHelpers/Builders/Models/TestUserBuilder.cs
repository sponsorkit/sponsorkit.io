using System;
using Sponsorkit.Domain.Models.Builders;

namespace Sponsorkit.Tests.TestHelpers.Builders.Models
{
    public class TestUserBuilder : UserBuilder
    {
        public TestUserBuilder()
        {
            WithCredentials(
                Array.Empty<byte>(),
                Array.Empty<byte>());

            WithStripeCustomerId("some-stripe-id");
        }
    }
}