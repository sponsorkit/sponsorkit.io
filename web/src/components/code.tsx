import { codeToHtml } from "shiki";

export type CodeLang = "ts" | "tsx" | "js" | "csharp" | "python" | "go" | "rust" | "bash" | "json" | "jsonc" | "html" | "toml" | "text";

/**
 * Syntax-highlighted code block, rendered at build time (React Server Component).
 * Ships no client JavaScript; light/dark colours switch via CSS (`--shiki-dark`).
 */
export async function Code({ code, lang, title }: { code: string; lang: CodeLang; title?: string }) {
  const source = code.replace(/^\n+|\s+$/g, "");
  const html =
    lang === "text"
      ? null
      : await codeToHtml(source, {
          lang,
          themes: { light: "github-light", dark: "github-dark" },
          defaultColor: "light",
        });
  return (
    <figure className="code" style={{ marginInline: 0 }}>
      {title ? (
        <figcaption className="code-title">
          <span>{title}</span>
        </figcaption>
      ) : null}
      {html ? (
        // Shiki output is generated from our own static strings at build time (its <pre> is focusable).
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre tabIndex={0}>
          <code>{source}</code>
        </pre>
      )}
    </figure>
  );
}
