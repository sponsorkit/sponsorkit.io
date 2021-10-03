using System.Collections.Generic;
using System.Linq;

namespace Sponsorkit.Domain.Helpers
{
    public static class GitHubCommentHelper
    {
        public static string RenderSpoiler(string title, string content)
        {
            return $"<details>\n<summary><b>{title}</b></summary>\n\n{content}\n</details>";
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
}
