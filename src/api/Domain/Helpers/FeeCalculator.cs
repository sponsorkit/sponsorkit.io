using System;

namespace Sponsorkit.Domain.Helpers
{
    public static class FeeCalculator
    {
        /// <summary>
        /// https://support.stripe.com/questions/passing-the-stripe-fee-on-to-customers
        /// </summary>
        public static long GetStripeFeeInHundreds(long amountInHundreds)
        {
            const decimal feeFixedRate = 1.80M;
            const decimal feePercentageRate = 2.9M;

            var amount = amountInHundreds / 100M;
            var feePercentageAmount = (amount / 100) * feePercentageRate;
            var totalFeeAmount = feePercentageAmount + feeFixedRate;
            
            return (int)Math.Round(totalFeeAmount * 100);
        }
        
        public static long GetSponsorkitFeeInHundreds(long amountInHundreds)
        {
            const decimal feeFixedRate = 1M;
            const decimal feePercentageRate = 7M;

            var amount = amountInHundreds / 100M;
            var feePercentageAmount = (amount / 100) * feePercentageRate;
            var totalFeeAmount = feePercentageAmount + feeFixedRate;
            
            return (int)Math.Round(totalFeeAmount * 100);
        }

        public static long GetAmountWithAllFeesOnTop(long amountInHundreds)
        {
            var feeBeforeAddition = GetStripeFeeInHundreds(amountInHundreds);
            var amountInHundredsWithFee = feeBeforeAddition + amountInHundreds;

            var feeAfterAddition = GetStripeFeeInHundreds(amountInHundredsWithFee);
            return (amountInHundreds + feeAfterAddition) + GetSponsorkitFeeInHundreds(amountInHundreds);
        }
    }
}