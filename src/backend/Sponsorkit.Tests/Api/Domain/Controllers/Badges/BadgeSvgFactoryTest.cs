using Microsoft.VisualStudio.TestTools.UnitTesting;
using Sponsorkit.Api.Domain.Controllers.Api.Badges;

namespace Sponsorkit.Tests.Api.Domain.Controllers.Badges;

[TestClass]
public class BadgeSvgFactoryTest
{
    [TestMethod]
    public void Render_EncodesLabelAndMessage()
    {
        var svg = BadgeSvgFactory.Render("a<b", "x&y");

        StringAssert.Contains(svg, "a&lt;b");
        StringAssert.Contains(svg, "x&amp;y");
        StringAssert.Contains(svg, "role=\"img\"");
    }

    [TestMethod]
    public void FormatDollarAmount_FormatsWholeAndFractionalAmounts()
    {
        Assert.AreEqual("$10", BadgeSvgFactory.FormatDollarAmount(10_00));
        Assert.AreEqual("$10.5", BadgeSvgFactory.FormatDollarAmount(10_50));
    }
}
