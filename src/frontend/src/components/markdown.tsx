import DOMPurify from "dompurify";
import marked, { Renderer } from "marked";
import * as classes from "./markdown.module.scss";

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

    public heading(text: string, level: 1 | 2 | 3 | 4 | 5 | 6, raw: string) {
        return `<h${level} class="${classes[`headingh${level}`]}">${raw}</h${level}>`
    }

    public image(href: string | null, title: string | null, text: string) {
        return `<img class="${classes.image}" src="${href}" alt="${text}" title="${title}" />`;
    }
}