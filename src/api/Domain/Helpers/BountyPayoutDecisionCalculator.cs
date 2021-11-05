namespace Sponsorkit.Domain.Helpers
{
    public record VerdictDistribution(
        int TotalVoteCount,
        int UndecidedVoteCount,
        int ScamVoteCount,
        int SolvedVoteCount,
        int UnsolvedVoteCount);

    public enum PayoutDecision
    {
        Payout,
        Redistribute
    }
    
    public static class BountyPayoutDecisionCalculator
    {
        public static PayoutDecision CalculatePayoutDecision(VerdictDistribution verdictDistribution)
        {
            if (verdictDistribution.ScamVoteCount >= 2)
                return PayoutDecision.Redistribute;
            
            var unsolvedRatio = verdictDistribution.UnsolvedVoteCount / (double)verdictDistribution.TotalVoteCount;
            if (unsolvedRatio >= 0.33)
                return PayoutDecision.Redistribute;

            return PayoutDecision.Payout;
        }
    }
}