using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Serilog;

namespace Sponsorkit.Infrastructure.AspNet.HostedServices
{
    public abstract class TimedHostedService : IHostedService, IDisposable
    {
        private readonly IServiceProvider serviceProvider;
        
        private Timer? timer;
        private Task? executingTask;
        private readonly CancellationTokenSource stoppingCancellationTokenSource = new();

        protected abstract TimeSpan Interval { get; }

        protected TimedHostedService(IServiceProvider serviceProvider)
        {
            this.serviceProvider = serviceProvider;
        }

        public Task StartAsync(CancellationToken cancellationToken)
        {
            timer = new Timer(
                ExecuteTask,
                null,
                Interval,
                Timeout.InfiniteTimeSpan);
            return Task.CompletedTask;
        }

        private void ExecuteTask(object? state)
        {
            timer?.Change(Timeout.Infinite, 0);
            executingTask = ExecuteTaskAsync(stoppingCancellationTokenSource.Token);
        }

        private async Task ExecuteTaskAsync(CancellationToken stoppingToken)
        {
            try
            {
                using var scope = serviceProvider.CreateScope();
                await RunJobAsync(scope.ServiceProvider, stoppingToken);
            }
            catch (Exception ex)
            {
                Log.Logger.Error(ex, "An error occured in the timed hosted service.");
                throw;
            }
            finally
            {
                timer?.Change(
                    Interval,
                    Timeout.InfiniteTimeSpan);
            }
        }

        protected abstract Task RunJobAsync(IServiceProvider serviceProvider, CancellationToken cancellationToken);

        public virtual async Task StopAsync(CancellationToken cancellationToken)
        {
            timer?.Change(Timeout.Infinite, 0);

            if (executingTask == null)
            {
                return;
            }

            try
            {
                stoppingCancellationTokenSource.Cancel();
            }
            finally
            {
                await Task.WhenAny(
                    executingTask,
                    Task.Delay(
                        Timeout.Infinite,
                        cancellationToken));
            }
        }

        public void Dispose()
        {
            stoppingCancellationTokenSource.Cancel();
            stoppingCancellationTokenSource.Dispose();
            timer?.Dispose();
        }
    }
}