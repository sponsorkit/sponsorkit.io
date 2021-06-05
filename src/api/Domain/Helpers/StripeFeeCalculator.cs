using System;

namespace Sponsorkit.Domain.Helpers
{
    public static class StripeFeeCalculator
    {
        /// <summary>
        /// https://support.stripe.com/questions/passing-the-stripe-fee-on-to-customers
        /// </summary>
        public static int GetStripeFeeInHundreds(int amountInHundreds)
        {
            const decimal feeFixedRate = 1.80M;
            const decimal feePercentageRate = 2.9M;

            var amount = amountInHundreds / 100M;
            var feePercentageAmount = (amount / 100) * feePercentageRate;
            var totalFeeAmount = feePercentageAmount + feeFixedRate;
            
            return (int)Math.Round(totalFeeAmount * 100);
        }
    }
}