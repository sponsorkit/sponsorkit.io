using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.BusinessLogic.Domain.Mediatr.Email;

namespace Sponsorkit.Tests.Reflection;

[TestClass]
public class EmailTemplateTest
{
    private static string GetSolutionRoot()
    {
        var currentDirectory = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
        while (currentDirectory != null && !File.Exists(Path.Combine(currentDirectory.FullName, "Sponsorkit.sln")))
            currentDirectory = currentDirectory.Parent;
        
        if (currentDirectory == null)
            throw new Exception("Could not find solution root.");
        
        return currentDirectory.FullName;
    }

    private static TemplateDirectory[] GetAllTemplateDirectories()
    {
        return Enum.GetValues<TemplateDirectory>();
    }

    private static string GetTemplatePath(TemplateDirectory directory, string fileName = "")
    {
        return Path.Combine(
            GetEmailTemplatesPath(), 
            directory.ToString(), 
            fileName);
    }

    private static string GetEmailTemplatesPath()
    {
        var solutionRoot = GetSolutionRoot();
        return Path.Combine(
            solutionRoot, 
            "src", 
            "api", 
            "Domain", 
            "Mediatr", 
            "Email", 
            "Templates");
    }

    [TestMethod]
    public async Task EveryEmailTemplateHasModelClass()
    {
        var allTemplateDirectories = GetAllTemplateDirectories();
        Assert.IsTrue(allTemplateDirectories.All(directory => File.Exists(GetTemplatePath(directory, "Model.cs"))));
    }

    [TestMethod]
    public async Task EveryEmailTemplateHasTemplateFile()
    {
        var allTemplateDirectories = GetAllTemplateDirectories();
        Assert.IsTrue(allTemplateDirectories.All(directory => File.Exists(GetTemplatePath(directory, "Template.cshtml"))));
    }
        
    [TestMethod]
    public async Task EveryTemplateDirectoryExists()
    {
        var allTemplateDirectories = GetAllTemplateDirectories();
        Assert.IsTrue(allTemplateDirectories.All(directory => Directory.Exists(GetTemplatePath(directory))));
    }
}