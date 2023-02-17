using System;
using System.Data;
using System.Diagnostics.CodeAnalysis;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.BusinessLogic.Domain.Mediatr.Behaviors.Database;
using Sponsorkit.Tests.TestHelpers;
using Sponsorkit.Tests.TestHelpers.Environments.Sponsorkit;

namespace Sponsorkit.Tests.Domain.Mediatr;

[TestClass]
public class DatabaseTransactionBehaviorTest
{
    [TestMethod]
    [SuppressMessage("ReSharper", "AccessToDisposedClosure")]
    public async Task Handle_NestedTransactionsOuterExceptionThrown_InnerAndOuterTransactionContentsReverted()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        //Act
        var exception = await Assert.ThrowsExceptionAsync<TestException>(async () =>
        {
            await environment.Mediator.Send(new TestCommand(async () =>
            {
                await environment.Database.UserBuilder.BuildAsync();

                await environment.Mediator.Send(new TestCommand(async () =>
                {
                    await environment.Database.UserBuilder.BuildAsync();
                }));

                throw new TestException();
            }));
        });

        //Assert
        Assert.IsNotNull(exception);

        await environment.Database.WithoutCachingAsync(async (dataContext) =>
        {
            var clusterCount = await dataContext.Users.CountAsync();
            Assert.AreEqual(0, clusterCount);
        });
    }

    [TestMethod]
    [SuppressMessage("ReSharper", "AccessToDisposedClosure")]
    public async Task Handle_NestedTransactionsWithNoException_InnerAndOuterTransactionContentsSaved()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        //Act
        await environment.Mediator.Send(new TestCommand(async () =>
        {
            await environment.Database.UserBuilder.BuildAsync();

            await environment.Mediator.Send(new TestCommand(async () =>
            {
                await environment.Database.UserBuilder.BuildAsync();
            }));
        }));

        //Assert
        await environment.Database.WithoutCachingAsync(async (dataContext) =>
        {
            var clusterCount = await dataContext.Users.CountAsync();
            Assert.AreEqual(2, clusterCount);
        });
    }

    [TestMethod]
    [SuppressMessage("ReSharper", "AccessToDisposedClosure")]
    public async Task Handle_NestedTransactionsInnerExceptionThrown_InnerAndOuterTransactionContentsReverted()
    {
        //Arrange
        await using var environment = await SponsorkitIntegrationTestEnvironment.CreateAsync();

        //Act
        var exception = await Assert.ThrowsExceptionAsync<TestException>(async () =>
        {
            await environment.Mediator.Send(new TestCommand(async () =>
            {
                await environment.Database.UserBuilder.BuildAsync();

                await environment.Mediator.Send(new TestCommand(async () =>
                {
                    await environment.Database.UserBuilder.BuildAsync();

                    throw new TestException();
                }));
            }));
        });

        //Assert
        Assert.IsNotNull(exception);

        await environment.Database.WithoutCachingAsync(async (dataContext) =>
        {
            var clusterCount = await dataContext.Users.CountAsync();
            Assert.AreEqual(0, clusterCount);
        });
    }

    public class TestCommand : IRequest, IDatabaseTransactionRequest
    {
        public Func<Task> Action { get; }

        public TestCommand(
            Func<Task> action)
        {
            this.Action = action;
        }

        public IsolationLevel TransactionIsolationLevel => IsolationLevel.Serializable;
    }

    public class TestCommandHandler : IRequestHandler<TestCommand>
    {
        public async Task<Unit> Handle(TestCommand request, CancellationToken cancellationToken)
        {
            await request.Action();
            return Unit.Value;
        }
    }
}