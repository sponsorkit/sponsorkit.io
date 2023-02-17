using System;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sponsorkit.BusinessLogic.Domain.Models.Database;
using Sponsorkit.BusinessLogic.Domain.Models.Database.Context;
using JsonSerializer = System.Text.Json.JsonSerializer;

namespace Sponsorkit.Tests.TestHelpers;

[ExcludeFromCodeCoverage]
[DebuggerStepThrough]
public static class Extensions
{
    public static TResponse ToResponseObject<TResponse>(this ActionResult<TResponse> httpResponseMessage) where TResponse : class
    {
        var objectResult = httpResponseMessage.Result as ObjectResult;
        var value = objectResult?.Value as TResponse ?? httpResponseMessage.Value;
        if (value != null)
            return value;
        
        if (objectResult == null || (value == null && objectResult?.Value != null))
        {
            throw new InvalidOperationException(
                $"Response of type {objectResult?.Value?.GetType()?.FullName ?? objectResult?.GetType()?.FullName} can't be converted to {typeof(TResponse).FullName}.\nJSON: " + JsonSerializer.Serialize(httpResponseMessage));
        }

        return value;
    }
        
    public static void EnsureControllerContext(this ControllerBase controller)
    {
        controller.ControllerContext.HttpContext = new DefaultHttpContext();
    }

    public static void FakeAuthentication(this ControllerBase controller, Guid userId)
    {
        controller.EnsureControllerContext();
        controller.HttpContext.User = TestClaimsPrincipalFactory.CreateWithUserId(userId);
    }

    public static void FakeAuthentication(this ControllerBase controller, User user)
    {
        controller.FakeAuthentication(user.Id);
    }

    public static void OnEntityAdded<TEntity>(
        this DataContext dataContext,
        Action action)
    {
        dataContext.ChangeTracker.Tracking += (_, args) =>
        {
            if (args.Entry.Entity is TEntity && args.State == EntityState.Added)
            {
                action();
            }
        };
    }
}