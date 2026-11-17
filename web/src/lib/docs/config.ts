/**
 * Docs platform constants. Shared by the Next.js routes, the build scripts in web/scripts and the
 * unit tests, so this module (and everything in src/lib/docs) only uses relative imports and Node APIs.
 *
 * Contracts: web/content/docs/CONTRIBUTING-DOCS.md (hand-written pages) and
 * web/content/docs/REFERENCE-CONTRACT.md (generated API reference).
 */
import { existsSync } from "node:fs";
import path from "node:path";

export const REPO_SLUG = "sponsorkit/sponsorkit.io";
export const REPO_URL = `https://github.com/${REPO_SLUG}`;
export const EDIT_BASE_URL = `${REPO_URL}/edit/main/`;
export const BLOB_BASE_URL = `${REPO_URL}/blob/main/`;

/** URL prefix of every docs page. */
export const DOCS_PREFIX = "/docs";
/** URL prefix of the generated API reference. The content tree must not contain a `reference/` folder. */
export const REFERENCE_PREFIX = "/docs/reference";

/** Languages with an SDK and a generated API reference, in sidebar order. */
export const REF_LANGS = ["js", "dotnet", "python", "go", "rust"] as const;
export type RefLang = (typeof REF_LANGS)[number];

export interface LangInfo {
  /** Human-readable name (sidebar, tabs, placeholders). */
  label: string;
  /** Package name as users install it. */
  pkg: string;
}

export const LANG_INFO: Record<RefLang, LangInfo> = {
  js: { label: "JavaScript / TypeScript", pkg: "@sponsorkit/sdk" },
  dotnet: { label: ".NET", pkg: "Sponsorkit" },
  python: { label: "Python", pkg: "sponsorkit" },
  go: { label: "Go", pkg: "github.com/sponsorkit/sponsorkit.io/sdks/go" },
  rust: { label: "Rust", pkg: "sponsorkit" },
};

export function isRefLang(v: string): v is RefLang {
  return (REF_LANGS as readonly string[]).includes(v);
}

/** Repo-relative path of each SDK's generator entrypoint (run as `bash <path> <out-dir>` with cwd `sdks/<lang>`). */
export function generatorEntrypoint(lang: RefLang): string {
  return `sdks/${lang}/scripts/gen-docs.sh`;
}

/** Site paths outside /docs that docs pages may link to. */
export const SITE_PATHS = new Set(["/", "/connect", "/connect/done", "/checkout", "/checkout/thanks"]);

export interface DocsDirs {
  /** Absolute path of web/. */
  webDir: string;
  /** Absolute path of the repository root. */
  repoDir: string;
  /** web/content/docs */
  contentDir: string;
  /** web/.generated/reference (one sub-folder per language) */
  generatedDir: string;
}

/**
 * Locates web/ from the current working directory (Next, Vitest and the scripts all run with
 * cwd = web/; running from the repo root also works). Override with SPONSORKIT_WEB_DIR.
 */
export function docsDirs(webDir?: string): DocsDirs {
  let web = webDir ?? process.env.SPONSORKIT_WEB_DIR;
  if (!web) {
    const cwd = process.cwd();
    web = existsSync(path.join(cwd, "content", "docs")) ? cwd : path.join(cwd, "web");
  }
  web = path.resolve(web);
  return {
    webDir: web,
    repoDir: path.dirname(web),
    contentDir: path.join(web, "content", "docs"),
    generatedDir: path.join(web, ".generated", "reference"),
  };
}

/** DOCS_STRICT=1: a missing generated reference (or a link into one) fails the build. */
export function isStrict(): boolean {
  return process.env.DOCS_STRICT === "1" || process.env.DOCS_STRICT === "true";
}
