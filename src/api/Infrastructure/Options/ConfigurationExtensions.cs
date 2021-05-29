using System;

// ReSharper disable once CheckNamespace
namespace Microsoft.Extensions.Configuration
{
    public static class ConfigurationExtensions
    {
        public static string GetSectionNameFor<TOptions>()
        {
            const string optionsSuffix = "Options";

            var configurationKey = typeof(TOptions).Name;
            if (configurationKey.EndsWith(optionsSuffix, StringComparison.InvariantCulture))
            {
                configurationKey = configurationKey.Replace(
                    optionsSuffix,
                    string.Empty,
                    StringComparison.InvariantCulture);
            }

            return configurationKey;
        }

        public static string GetSectionNameFor<TOptions>(this IConfiguration? _)
        {
            return GetSectionNameFor<TOptions>();
        }

        public static TOptions GetOptions<TOptions>(this IConfiguration configuration, string? name = null) where TOptions : new()
        {
            return 
                GetNestedConfigurationSection<TOptions>(configuration, name)
                   .Get<TOptions>() ?? 
               new TOptions();
        }

        public static IConfigurationSection GetNestedConfigurationSection<TOptions>(this IConfiguration configuration, string? name = null)
        {
            var valuesSection = configuration.GetSection("Values");
            var valuesConfigurationSection = valuesSection.GetSection(name);
            return valuesConfigurationSection.GetSection(
                name ?? 
                GetSectionNameFor<TOptions>(configuration));
        }
    }
}
