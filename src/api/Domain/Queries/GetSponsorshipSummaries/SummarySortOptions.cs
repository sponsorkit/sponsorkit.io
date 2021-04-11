namespace Sponsorkit.Domain.Queries.GetSponsorshipSummaries
{
    public readonly struct SummarySortOptions
    {
        public SummarySortOptions(SummarySortProperty property, SortDirection direction)
        {
            Property = property;
            Direction = direction;
        }

        public SummarySortProperty Property { get; }
        public SortDirection Direction { get; }
    }
}