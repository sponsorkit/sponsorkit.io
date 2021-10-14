using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Sponsorkit.Tests.Infrastructure.Ioc
{
    [TestClass]
    public class IocRegistryTest
    {
        [TestMethod]
        public void Registration_NotRunningFromTest_DockerDependencyServiceNotInjected()
        {
            Assert.Fail();
        }
    }
}