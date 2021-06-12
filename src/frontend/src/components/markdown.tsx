import React from "react";
import DOMPurify from "dompurify";
import marked from "marked";

export function Markdown(props: {
    markdown: string|undefined|null,
    className?: string
}) {
    if(!props.markdown)
        return null;

    const html = marked(props.markdown);
    const sanitizedHtml = DOMPurify.sanitize(html);
    return <div className={props.className} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
}