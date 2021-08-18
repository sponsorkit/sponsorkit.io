import DOMPurify from "dompurify";
import marked, { Renderer } from "marked";

export function Markdown(props: {
    markdown: string|undefined|null,
    className?: string
}) {
    if(!props.markdown)
        return null;

    const html = marked(props.markdown, {
        renderer: new GitHubMarkdownRenderer()
    });
    const sanitizedHtml = DOMPurify.sanitize(html);
    return <div 
        className={props.className} 
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
}

class GitHubMarkdownRenderer extends Renderer {
    public link(href: string|null, _: string|null, text: string|null) {
        return `<a target="_blank" rel="nofollow" href="${ href ? encodeURI(href) : ""}">${text ?? ""}</a>`;
    }
}