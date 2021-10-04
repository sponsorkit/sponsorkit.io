using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Sponsorkit.Tests.Domain.Mediatr
{
    [TestClass]
    public class EnsureGitHubIssueInDatabaseCommandTest
    {
        [TestMethod]
        public async Task Handle_NoRepositoryFound_ReturnsNotFound()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task Handle_NoIssueFound_ReturnsNotFound()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task Handle_NoDatabaseRepositoryFound_CreatesNewRepository()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task Handle_ExistingDatabaseRepositoryFound_UsesExistingRepository()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task Handle_NoDatabaseIssueFound_CreatesNewIssue()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task Handle_ExistingDatabaseIssueFound_ReturnsExistingIssue()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
        
        [TestMethod]
        public async Task Handle_IssueHappensDuringIssueCreation_RepositoryChangesAreRolledBack()
        {
            //Arrange
            
            //Act
            
            //Assert
            Assert.Fail("Not implemented.");
        }
    }
}