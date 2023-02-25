

// ReSharper disable once CheckNamespace
namespace Microsoft.Extensions.Configuration;

public static class ConfigurationExtensions
{
    public static string GetSectionNameFor<TOptions>()
    {
        const string optionsSuffix = "Options";

        var configurationKey = typeof(TOptions).Name;
        if (configurationKey.EndsWith(optionsSuffix, StringComparison.InvariantCulture))
        {
            configurationKey = configurationKey[
                ..configurationKey.LastIndexOf(
                    optionsSuffix,
                    StringComparison.InvariantCulture)];
        }

        return configurationKey;
    }

    public static string GetSectionNameFor<TOptions>(this IConfiguration? _)
    {
        return GetSectionNameFor<TOptions>();
    }

    public static TOptions GetOptions<TOptions>(this IConfiguration configuration, string? name = null) where TOptions : new()
    {
        var nestedConfigurationSection = GetNestedConfigurationSection<TOptions>(configuration, name);
        return
            nestedConfigurationSection.Get<TOptions>() ??
            new TOptions();
    }

    public static IConfigurationSection GetNestedConfigurationSection<TOptions>(this IConfiguration configuration, string? name = null)
    {
        var nameToUse = name ?? GetSectionNameFor<TOptions>(configuration);
        var valuesConfigurationSection = configuration.GetSection(nameToUse);
        return valuesConfigurationSection;
    }
}