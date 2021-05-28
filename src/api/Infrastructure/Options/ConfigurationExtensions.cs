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

        public static TOptions GetSection<TOptions>(this IConfiguration configuration, string? name = null) where TOptions : new()
        {
            return configuration
                .GetSection(name ?? GetSectionNameFor<TOptions>(configuration))
                .Get<TOptions>() ?? 
                new TOptions();
        }
    }
}
