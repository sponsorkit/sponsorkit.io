using System;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sponsorkit.Internal;

/// <summary>
/// Reads any ISO-8601 date-time and writes UTC with millisecond precision (<c>2026-01-01T00:00:00Z</c>).
/// An unparseable date string reads as <c>null</c>, so one bad stored or received date never makes the whole
/// document unreadable; a non-string token is a <see cref="JsonException"/>.
/// </summary>
internal sealed class IsoDateTimeConverter : JsonConverter<DateTimeOffset?>
{
    public override bool HandleNull => true;

    public override DateTimeOffset? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType != JsonTokenType.String) throw new JsonException("Expected an ISO-8601 date string.");
        return Iso.TryParse(reader.GetString(), out var value) ? value : null;
    }

    public override void Write(Utf8JsonWriter writer, DateTimeOffset? value, JsonSerializerOptions options)
    {
        if (value is null) writer.WriteNullValue();
        else writer.WriteStringValue(Iso.Format(value.Value));
    }
}

internal static class Iso
{
    public static DateTimeOffset Parse(string s) =>
        DateTimeOffset.Parse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal);

    public static bool TryParse(string? s, out DateTimeOffset value) =>
        DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out value);

    /// <summary>UTC, millisecond precision, trailing zeros of the fraction dropped.</summary>
    public static string Format(DateTimeOffset value)
    {
        var utc = value.UtcDateTime;
        utc = new DateTime(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Utc);
        return utc.ToString("yyyy'-'MM'-'dd'T'HH':'mm':'ss.FFF'Z'", CultureInfo.InvariantCulture);
    }
}

internal static class SponsorkitJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = false,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);

    public static T? Deserialize<T>(string json) => JsonSerializer.Deserialize<T>(json, Options);
}
