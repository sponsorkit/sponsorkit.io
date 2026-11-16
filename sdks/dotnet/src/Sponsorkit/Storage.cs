namespace Sponsorkit;

/// <summary>
/// A storage backend for the per-target-set state (session token, cache, nag counters). The content is the
/// PROTOCOL §8 JSON document; keys are <c>targets_hash</c> strings.
/// </summary>
/// <remarks>Implementations must make <see cref="Write"/> atomic: a concurrent <see cref="Read"/> sees the old or the new content, never a mix.</remarks>
public interface ISponsorkitStorage
{
    /// <summary>Returns the stored JSON for <paramref name="key"/>, or <c>null</c> if there is none.</summary>
    /// <param name="key">The <c>targets_hash</c>.</param>
    string? Read(string key);

    /// <summary>Atomically replaces the stored JSON for <paramref name="key"/>.</summary>
    /// <param name="key">The <c>targets_hash</c>.</param>
    /// <param name="json">The PROTOCOL §8 document.</param>
    void Write(string key, string json);
}
