using System;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Sponsorkit.Domain.Models;
using Sponsorkit.Domain.Models.Context;
using JsonSerializer = System.Text.Json.JsonSerializer;

namespace Sponsorkit.Tests.TestHelpers
{
    [ExcludeFromCodeCoverage]
    [DebuggerStepThrough]
    public static class Extensions
    {
        public static TResponse ToObject<TResponse>(this ActionResult<TResponse> httpResponseMessage) where TResponse : class
        {
            var objectResult = httpResponseMessage.Result as ObjectResult;
            var value = objectResult?.Value as TResponse;
            if (objectResult == null || (value == null && objectResult?.Value != null))
            {
                throw new InvalidOperationException(
                    $"Response of type {objectResult?.Value?.GetType()?.FullName ?? objectResult?.GetType()?.FullName} can't be converted to {typeof(TResponse).FullName}.\nJSON: " + JsonSerializer.Serialize(httpResponseMessage));
            }

            return value;
        }
        
        private static void EnsureControllerContext(this ControllerBase controller)
        {
            controller.ControllerContext.HttpContext = new DefaultHttpContext();
        }

        public static void FakeAuthentication(this ControllerBase controller, Guid userId)
        {
            controller.EnsureControllerContext();
            controller.HttpContext.User = TestClaimsPrincipalFactory.CreateWithUserId(userId);
        }
    }
}
