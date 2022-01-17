using System.Collections.Generic;
using System.Linq;
using Flurl;

namespace Sponsorkit.Domain.Helpers;

public static class GitHubCommentHelper
{
    public static string RenderBold(string content)
    {
        return $"<b>{content}</b>";
    }
        
    public static string RenderSpoiler(string title, string content)
    {
        return $"<details>\n<summary>{RenderBold(title)}</summary>\n\n{content}\n</details>";
    }

    public static string RenderLink(string text, string url)
    {
        return $"[{text}]({url})";
    }

    public static string RenderCodeBlock(string language, string content)
    {
        return $"```{language}\n{content}\n```";
    }

    public static string RenderList(IEnumerable<string> lines)
    {
        return string.Join("\n", lines
            .Select(x => $"- {x}"));
    }
}