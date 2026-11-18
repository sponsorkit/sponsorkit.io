# Writing Sponsorkit docs

This folder is the source of <https://sponsorkit.github.io/sponsorkit.io/docs/>. Every `.md` file here (except files whose name has
uppercase letters, like this one) is a page. The generated API reference is described in
[REFERENCE-CONTRACT.md](REFERENCE-CONTRACT.md).

```sh
bun run --cwd web dev               # http://localhost:3000/sponsorkit.io/docs/ (default BASE_PATH), re-reads content on every request
BASE_PATH= bun run --cwd web dev    # the same at the root: http://localhost:3000/docs/
bun run --cwd web test              # unit tests, including "every page compiles"
bun run --cwd web build             # static export to web/out; fails on any content error
bun run --cwd web docs:check-links  # after a build: every internal link and #anchor resolves
```

## Ownership

Each folder is owned by one author so pages can be written in parallel without conflicts. Only edit files in
the folders you own; link to other areas instead of copying their content.

| Folder | Owner |
|---|---|
| `index.md`, `languages/_section.md`, `languages/index.md`, `*.md` with uppercase names | platform |
| `getting-started/`, `install/`, `concepts/` | guides-a |
| `guides/`, `reference-http/` (HTTP API, protocol, self-hosting, FAQ) | guides-b |
| `languages/<lang>/` for `js`, `dotnet`, `python`, `go`, `rust` | `lang-<lang>` |
| `/docs/reference/<lang>` (generated, not in this folder) | `lang-<lang>`, via `sdks/<lang>/scripts/gen-docs.sh` |

Owners may add, rename and remove pages and sub-folders inside their folders. Nothing outside the folder
needs editing: navigation is derived from the files.

## Files, URLs and navigation

| File | URL |
|---|---|
| `index.md` | `/docs` |
| `concepts/index.md` | `/docs/concepts` |
| `concepts/targets.md` | `/docs/concepts/targets` |
| `languages/js/sign-in.md` | `/docs/languages/js/sign-in` |

- File and folder names are lowercase kebab-case (`[a-z0-9]+(-[a-z0-9]+)*`); `.md` only.
- Every folder needs a `_section.md` (see below). A folder's `index.md` is its landing page and is listed first
  in its sidebar group (label "Overview" unless `sidebar_label` says otherwise).
- `reference/` is reserved for the generated API reference; don't create it here.
- Sidebar order: within a folder, pages and sub-folders sort by `order`, then by title. Top-level sections
  must use `order` < 1000 (the generated "API reference" group is 1000).
- Prev/next links follow sidebar order. Breadcrumbs follow the folder structure.
- Files with uppercase letters in their name (`README.md`, `CONTRIBUTING-DOCS.md`) are notes for authors and are
  not published.

### Page frontmatter

```yaml
---
title: Sign-in & sessions          # required: <h1>, <title>, search
description: How supporters sign in. # required: lede under the title, meta description, search
order: 20                          # optional, default 100: position within the folder
sidebar_label: Sign-in             # optional: shorter label in the sidebar
toc: false                         # optional, default true: hide "On this page"
---
```

Unknown fields are an error. The page title is rendered from frontmatter, so the body must not contain a
`# H1`; start with text or `##` headings. A page with no body renders a "Coming soon" note.

### `_section.md`

```yaml
---
title: Concepts      # required: sidebar group title, breadcrumb
order: 30            # required
collapsed: true      # optional, default false: collapsed in the sidebar unless it holds the current page
---

<!-- OWNERS: guides-a. ... -->
```

Its body is never rendered; keep the OWNERS comment there.

## Markdown

CommonMark plus GitHub Flavored Markdown (tables, task lists, strikethrough, autolinks, footnotes). Raw HTML
is **not** rendered (HTML comments are fine for notes).

### Headings and anchors

`##` to `######`. Each heading gets an id: GitHub's slug of its text (`## Sign-in & sessions` →
`#sign-in--sessions`), de-duplicated with `-1`, `-2`. Give a heading a stable id with a `{#id}` suffix:

```md
## Session tokens {#tokens}
```

Ids must be unique on a page. `##` and `###` headings appear in "On this page". Every heading shows a `#`
permalink on hover.

### Links

Write internal links as **relative `.md` paths** (preferred) or **`/docs/...` paths**:

```md
[targets](targets.md)
[targets](../concepts/targets.md#target-sets-are-sealed-into-sessions)
[quickstart](/docs/getting-started/quickstart)
[JavaScript API reference](/docs/reference/js)
```

- Links are checked when the page is built: a missing page is a build error. `#anchors` are checked by
  `docs:check-links` after the build.
- Relative links must end in `.md` and stay in this content folder.
- Link into the generated reference with `/docs/reference/<lang>/...` paths. When a language's reference wasn't
  generated (local builds), such deep links fall back to `/docs/reference/<lang>` with a warning; with
  `DOCS_STRICT=1` they fail the build.
- Other site paths allowed: `/`, `/connect/`, `/connect/done/`, `/checkout/`, `/checkout/thanks/` (write the
  trailing-slash form; the form without the slash is accepted too). The base path is added at build time.
- External links: full `https://` URLs.

### Code blocks

Fenced code blocks are highlighted at build time with Shiki (any Shiki language id or alias: `ts`, `csharp`,
`python`, `go`, `rust`, `bash`, `jsonc`, `toml`, …; `text` for none). Every block gets a Copy button. Options go
in the fence's meta string:

````md
```ts title="app.ts"
const sk = new Sponsorkit({ github: "octocat" });
```
````

| Meta | Meaning |
|---|---|
| `title="app.ts"` | Caption above the block (file name, "Terminal", …). |
| `tab="Label"` | Tab label (inside `:::tabs`). |
| `key="js"` | Tab key (inside `:::tabs`). |

### Tabs

A `:::tabs` container turns consecutive code blocks into tabs. The reader's choice is remembered site-wide per
**group** (default group `lang`), in `localStorage` key `sponsorkit.tabs.<group>`, and every tab set of the same
group on the page switches together.

````md
:::tabs
```ts title="app.ts"
await sk.getFinancialContribution();
```

```python title="app.py"
sk.get_financial_contribution()
```
:::
````

- Tab **key** = `key="..."`, else derived from the fence language: `ts`/`tsx`/`js`/`javascript`/`typescript` →
  `js`; `cs`/`csharp`/`fsharp` → `dotnet`; `py`/`python` → `python`; `go` → `go`; `rs`/`rust` → `rust`; other
  languages → the language id itself.
- Tab **label** = `tab="..."`, else `JavaScript`, `.NET`, `Python`, `Go`, `Rust` for those keys, else the `title`.
- Keys must be unique within one `:::tabs`. For several blocks in the same language (e.g. install commands, all
  `bash`) set `tab` and `key` explicitly:

````md
:::tabs
```bash tab=".NET" key="dotnet"
dotnet add package Sponsorkit
```

```bash tab="Python" key="python"
pip install sponsorkit
```
:::
````

- Use the SDK keys `js`, `dotnet`, `python`, `go`, `rust` in the default group so readers' language choice carries
  across pages. Use another group for unrelated choices: `:::tabs{group="pm"}` (npm / pnpm / yarn).
- For prose (or several blocks) per tab, use `:::tab[Label]{key="..."}` containers; the outer fence then needs
  more colons than the inner ones:

````md
::::tabs
:::tab[JavaScript]{key="js"}
Call `signIn()` from a click handler.

```ts
button.onclick = () => sk.signIn();
```
:::

:::tab[Python]{key="python"}
Call `sk.sign_in()`.
:::
::::
````

  Without `key`, a `:::tab` label of `JavaScript`, `.NET`, `Python`, `Go` or `Rust` (or a language's full name)
  maps to the SDK key; other labels are slugified.
- Only code blocks or `:::tab` containers may appear directly inside `:::tabs`; tabs can't be nested.

### Callouts

```md
:::note
Plain note.
:::

:::tip[Try it without signing in]
Custom title in brackets.
:::

:::warning
Something to be careful about.
:::

:::danger
Something that breaks things.
:::
```

GitHub alert syntax also works: `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]` (note), `> [!WARNING]`,
`> [!CAUTION]` (danger).

### Tables

GitHub tables. Wide tables scroll horizontally on small screens.

### What fails the build

Missing/unknown frontmatter fields, bad file names, a missing `_section.md`, an `# H1` in the body, duplicate
heading ids, broken internal links, unknown `:::directives`, malformed `:::tabs`. Warnings (printed, not fatal):
unknown code languages, raw HTML, deep links into a reference that wasn't generated.

## Search

`/search-index.json` is built from every page (title, description, `##`/`###` sections and their text, generated
reference included). Readers open search with `/` or Ctrl/⌘ K. Nothing to do as an author: good titles,
descriptions and headings make good results.
