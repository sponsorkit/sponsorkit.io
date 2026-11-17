# Generated API reference: contract

Each SDK has a generator that turns its source code and doc comments into Markdown. The website renders that
Markdown under `/docs/reference/<lang>/…` with its own sidebar group ("API reference" → language). This file is
the contract between the generators (owned by `lang-<lang>`) and the website (owned by platform).

`<lang>` is one of `js`, `dotnet`, `python`, `go`, `rust`.

## Entrypoint

| | |
|---|---|
| File | `sdks/<lang>/scripts/gen-docs.sh` (exists for every language; the current ones are stubs) |
| Invocation | `bash scripts/gen-docs.sh <out-dir>` with **cwd `sdks/<lang>`** |
| `<out-dir>` | absolute path of an **empty** directory; also in `$SPONSORKIT_DOCS_OUT` |
| Environment | `SPONSORKIT_DOCS_LANG=<lang>`, `SPONSORKIT_REPO_ROOT=<absolute repo root>` |
| Success | exit 0 with the files below in `<out-dir>` |
| Failure | non-zero exit; output is discarded |

The script may call anything installed in CI for that SDK (`node`/`bun`, `dotnet`, `python3`, `go`, `cargo`);
check prerequisites and fail with a clear message. It must not write outside `<out-dir>` (temporary files go in
`mktemp -d`), must not need network access beyond the package registries, and must be deterministic (no
timestamps in page content; `_meta.json` `generatedAt` is allowed). Keep any generator code inside
`sdks/<lang>/` and out of the published package.

Run all generators (the orchestrator validates each output and moves it into `web/.generated/reference/<lang>/`,
which is gitignored):

```sh
bun run --cwd web docs:generate                     # all languages; failures are reported and skipped
bun run --cwd web docs:generate --only go,rust      # some languages
bun run --cwd web docs:generate --strict            # any failure exits 1 (CI)
bun run --cwd web docs:generate --strict --no-stubs # also reject stub output
```

Check a generator's output without building the site:

```sh
bun run --cwd web docs:validate <lang>                   # validates web/.generated/reference/<lang>
bun run --cwd web docs:validate <lang> --dir /tmp/out    # validates any folder
```

`bun run --cwd web build` renders whatever is in `web/.generated/reference/`. A language with no output renders a
placeholder page at `/docs/reference/<lang>` explaining how to generate it; with `DOCS_STRICT=1` a missing
language fails the build instead.

## Output layout

```
<out-dir>/
  _meta.json            required
  index.md              required → /docs/reference/<lang>
  <page>.md             one page per module / namespace / package / type → /docs/reference/<lang>/<page>
  <folder>/             optional nesting → /docs/reference/<lang>/<folder>
    _section.md         optional: sidebar title/order for the folder (same format as hand-written docs)
    index.md            optional: the folder's landing page
    <page>.md
```

- File and folder names: lowercase kebab-case, `^[a-z0-9]+(-[a-z0-9]+)*$`, `.md` only. No dots, underscores
  (except `_meta.json`/`_section.md`) or uppercase. Derive names from symbols by lowercasing and replacing every
  run of characters outside `[a-z0-9]` with `-` (`Sponsorkit.SponsorkitClient` → `sponsorkit-sponsorkitclient`,
  `ContributionResult` → `contributionresult`, `sponsorkit::Error` → `error` inside a `sponsorkit/` folder). On a
  collision append `-2`, `-3` in a stable order.
- Granularity is the generator's choice; recommended: one page per public type (class, struct, interface,
  trait, enum, type alias) and one per module/namespace/package listing its functions and constants.
- Without `_section.md`, a folder's sidebar title is the folder name. Sidebar order is `order`, then title.
- Every `.md` file is a page; other files are ignored (warning).

### `_meta.json`

```json
{
  "lang": "js",
  "package": "@sponsorkit/sdk",
  "version": "0.1.0",
  "generator": "sdks/js/scripts/gen-docs.sh (TypeScript compiler API)",
  "generatedAt": "2026-11-17T12:00:00Z",
  "stub": false
}
```

| Field | |
|---|---|
| `lang` | required, must equal `<lang>` |
| `generator` | required, non-empty string describing the tool |
| `package`, `version`, `generatedAt` | optional strings |
| `stub` | optional boolean; `true` marks placeholder output (shown with a notice) |

### Page frontmatter

```yaml
---
title: SponsorkitClient                   # required: <h1>, sidebar, search
description: Client for checking contributions, signing in and opening checkout.   # required, one sentence
kind: class                               # optional (index.md: `index`)
symbol: Sponsorkit.SponsorkitClient       # optional: fully qualified name (indexed by search)
source: sdks/dotnet/src/Sponsorkit/SponsorkitClient.cs#L12   # optional: repo-relative; "View source" link
order: 10                                 # optional, default 100
sidebar_label: SponsorkitClient           # optional
toc: true                                 # optional, default true
---
```

`kind` is one of `index`, `package`, `module`, `namespace`, `class`, `struct`, `interface`, `trait`, `enum`,
`type`, `function`, `constant`, `variable`, `error`, `other`. Unknown fields are errors. `index.md` should use
`kind: index`; its sidebar label is "Overview". The language's sidebar group title is fixed (`JavaScript /
TypeScript`, `.NET`, `Python`, `Go`, `Rust`).

### Page body

- Same Markdown as hand-written pages (see [CONTRIBUTING-DOCS.md](CONTRIBUTING-DOCS.md)): GFM, fenced code with
  Shiki language ids, `:::note`/`:::tip`/`:::warning`/`:::danger`, `:::tabs`. No raw HTML, no `# H1` (the title is
  rendered from frontmatter). No page may be empty.
- Recommended structure for a type page: summary paragraph; a signature block; `## Constructors`,
  `## Properties`, `## Methods` (or the language's natural groups) with one `###` per member:

  ````md
  ## Methods

  ### GetFinancialContributionAsync {#getfinancialcontributionasync}

  ```csharp
  public Task<ContributionResult> GetFinancialContributionAsync(GetOptions? options = null, CancellationToken ct = default)
  ```

  Returns the current user's contributions to the configured targets. Never throws because of the network.
  ````

- **Anchors.** Give every member heading an explicit id with a `{#id}` suffix. Ids match
  `^[a-z0-9]+([-_][a-z0-9]+)*$`: the member name lowercased with every run of other characters replaced by `-`
  (`getFinancialContribution` → `getfinancialcontribution`, `sign_in` → `sign_in`, `CheckoutURL` → `checkouturl`).
  Overloads get `-2`, `-3`. Ids must be unique per page. Group headings (`## Methods`) may use automatic slugs.
- **Links within the reference** are relative `.md` paths inside `<out-dir>`, optionally with an anchor:
  `[ContributionResult](contributionresult.md)`, `[signIn](sponsorkit.md#signin)`,
  `[Error](../errors/index.md)`. They must resolve to a file in the same language's output, and the anchor must
  exist on the target page.
- **Links to hand-written docs** are `/docs/...` paths (e.g. `/docs/concepts/error-contract`); they must exist.
  Don't link to another language's reference or to `https://sponsorkit.io/docs/...`.
- External links (e.g. MDN, docs.rs for dependencies) are full `https://` URLs.

### Validation

`docs:validate` (and `docs:generate`, before accepting output) checks: `_meta.json`; `index.md` exists;
frontmatter of every page; file names; non-empty pages; no H1; unique heading ids; every internal link resolves
and every `#anchor` exists; `source` files exist (warning). Output with errors is rejected.
