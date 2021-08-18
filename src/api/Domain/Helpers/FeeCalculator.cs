using System;

namespace Sponsorkit.Domain.Helpers
{
    public static class FeeCalculator
    {
        public static long GetSponsorkitFeeInHundreds(long amountInHundreds)
        {
            return (long)Math.Round(amountInHundreds / 100M * 10M);
        }
    }
}