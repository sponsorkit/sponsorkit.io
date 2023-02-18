using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace Sponsorkit.Tests.BusinessLogic.Domain.Mediatr;

[TestClass]
public class UpsertIssueCommentCommandTest
{
    [TestMethod]
    public async Task Handle_OwnerDifferentThanSponsorkitOnDevelopmentEnvironment_DoesNothing()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task Handle_OwnerDifferentThanSponsorkitOnProductionEnvironment_ExecutesCommand()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task Handle_ExistingBotCommentFound_UpdatesExistingComment()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
        
    [TestMethod]
    public async Task Handle_NoExistingBotCommentFound_CreatesNewComment()
    {
        //Arrange
            
        //Act
            
        //Assert
        Assert.Fail("Not implemented.");
    }
}