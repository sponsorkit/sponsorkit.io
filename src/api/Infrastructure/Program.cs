﻿using System;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Threading.Tasks;
using FluffySpoon.AspNet.NGrok;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Serilog;
using Sponsorkit.Infrastructure.AspNet;
using Sponsorkit.Infrastructure.Logging;

namespace Sponsorkit.Infrastructure
{
    public class Program
    {
        [SuppressMessage("Design", "CA1031:Do not catch general exception types", Justification = "This is the main method.")]
        static async Task<int> Main(string[] args)
        {
            var configuration = ConfigurationFactory.BuildConfiguration("sponsorkit-secrets", args);
            Log.Logger = LoggerFactory.BuildWebApplicationLogger(configuration);

            try
            {
                var host = CreateDoggerHostBuilder(configuration, args).Build();
                await DatabaseMigrator.MigrateDatabaseForHostAsync(host);

                await host.RunAsync();

                return 0;
            }
            catch (Exception ex) when(!Debugger.IsAttached)
            {
                Log.Fatal(ex, "Host terminated unexpectedly");
                return 1;
            }
            finally
            {
                Log.CloseAndFlush();
            }
        }

        public static IHostBuilder CreateDoggerHostBuilder(IConfiguration? configuration, string[] args) =>
            Host.CreateDefaultBuilder(args)
                .UseSerilog()
                .ConfigureWebHostDefaults(webBuilder =>
                {
                    if (configuration != null)
                        webBuilder.UseConfiguration(configuration);

                    webBuilder.UseStartup<Startup>();
                    webBuilder.UseNGrok(new NgrokOptions()
                    {
                        Disable = !Debugger.IsAttached,
                        ShowNGrokWindow = false
                    });
                });

        [SuppressMessage(
            "CodeQuality", 
            "IDE0051:Remove unused private members", 
            Justification = "This is used for Entity Framework when running console commands for migrations etc. It must have this signature.")]
        private static IHostBuilder CreateHostBuilder(string[] args) => CreateDoggerHostBuilder(null, args);
    }
}