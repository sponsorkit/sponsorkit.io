using System;
using System.Linq;
using System.Reflection;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Api;

namespace Sponsorkit.Tests.Reflection;

[TestClass]
public class AttributeTest
{
    [TestMethod]
    public void EnsureProperSwaggerStatusCodesOnAuthenticatedCalls()
    {
        var hasFailed = false;
            
        var errorMessageBuilder = new StringBuilder();
        errorMessageBuilder.AppendLine("The following authorized endpoints have no 401 swagger status:");
            
        var controllers = typeof(ApiStartup).Assembly
            .GetTypes()
            .Where(ExtendsControllerType);
            
        foreach (var controller in controllers)
        {
            var endpoints = controller
                .GetMethods()
                .Where(HasRouteAttribute);
            foreach (var endpoint in endpoints)
            {
                var swaggerAttributes = endpoint.GetCustomAttributes<ProducesResponseTypeAttribute>();
                var anonymousAttribute = endpoint.GetCustomAttribute<AllowAnonymousAttribute>();
                if (anonymousAttribute != null)
                    continue;
                    
                var unauthorizedAttribute = swaggerAttributes.SingleOrDefault(x => x.StatusCode == StatusCodes.Status401Unauthorized);
                if (unauthorizedAttribute != null)
                    continue;
                    
                errorMessageBuilder.AppendLine($" - {controller.FullName}");
                hasFailed = true;
            }
        }

        if (hasFailed)
            Assert.Fail(errorMessageBuilder.ToString());
    }

    private static bool HasRouteAttribute(MethodInfo method)
    {
        var routeAttributes = new []
        {
            typeof(HttpPostAttribute),
            typeof(HttpGetAttribute),
            typeof(HttpPatchAttribute),
            typeof(HttpPutAttribute),
            typeof(HttpDeleteAttribute),
            typeof(HttpHeadAttribute),
            typeof(HttpOptionsAttribute)
        };

        return method
            .GetCustomAttributes()
            .Any(x => routeAttributes
                .Any(r => r == x.GetType()));
    }

    private static bool ExtendsControllerType(Type type)
    {
        if (type == null)
            return false;
                
        if (type == typeof(ControllerBase))
            return true;

        return ExtendsControllerType(type.BaseType);
    }
}