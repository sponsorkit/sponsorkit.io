namespace Sponsorkit.BusinessLogic.Domain.Helpers;

public static class FeeCalculator
{
    public static long GetSponsorkitFeeInHundreds(long amountInHundreds)
    {
        return (long)Math.Floor(amountInHundreds / 100M * 10M);
    }
}