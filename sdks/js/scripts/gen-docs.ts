/**
 * API reference generator for `@sponsorkit/sdk` (dev-only; not part of the published package).
 *
 *   bun scripts/gen-docs.ts <out-dir>        (cwd: sdks/js; normally run through gen-docs.sh)
 *
 * Reads the package's four entry points with the TypeScript compiler API (the `typescript` dev dependency) and
 * writes Markdown in the layout described in web/content/docs/REFERENCE-CONTRACT.md:
 *
 *   index.md                     overview: entry points and every public symbol
 *   <entry>/index.md             one module page per entry point, with its functions and constants
 *   <entry>/<symbol>.md          one page per class, interface and type alias, under the entry point that owns it
 *
 * A symbol exported from several entry points is documented once, under the first of `sdk`, `node`, `server`,
 * `elements` that exports it. Symbols tagged `@internal`, and private/protected class members, are left out.
 * Output is deterministic: no timestamps, symbols in a fixed order.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

// ------------------------------------------------------------------------------------------------ setup

const outDir = process.argv[2] ?? process.env.SPONSORKIT_DOCS_OUT;
if (!outDir || !path.isAbsolute(outDir)) {
  console.error("usage: bun scripts/gen-docs.ts <absolute-out-dir>");
  process.exit(2);
}
const sdkDir = path.resolve(import.meta.dirname, "..");
const repoDir = path.resolve(sdkDir, "..", "..");
const pkg = JSON.parse(readFileSync(path.join(sdkDir, "package.json"), "utf8")) as { name: string; version: string };

interface Entry {
  id: string;
  specifier: string;
  file: string;
  title: string;
  summary: string;
  order: number;
}

const ENTRIES: Entry[] = [
  {
    id: "sdk",
    specifier: "@sponsorkit/sdk",
    file: "src/index.ts",
    title: "Browser",
    summary: "Browser client (popup or redirect sign-in, `localStorage`), plus every shared type and helper.",
    order: 10,
  },
  {
    id: "node",
    specifier: "@sponsorkit/sdk/node",
    file: "src/node/index.ts",
    title: "Node, Bun, Deno",
    summary: "Native client for CLIs and desktop apps (loopback or paste-back sign-in, per-user config directory).",
    order: 20,
  },
  {
    id: "server",
    specifier: "@sponsorkit/sdk/server",
    file: "src/server.ts",
    title: "Server",
    summary: "Backend verification of a supporter's session token. No storage; runs in Workers.",
    order: 30,
  },
  {
    id: "elements",
    specifier: "@sponsorkit/sdk/elements",
    file: "src/elements.ts",
    title: "Web components",
    summary: "`<sponsorkit-button>` and `<sponsorkit-badge>` custom elements.",
    order: 40,
  },
];

const configPath = path.join(sdkDir, "tsconfig.json");
const config = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined });
if (!config) throw new Error(`Could not read ${configPath}`);
const program = ts.createProgram({
  rootNames: ENTRIES.map((e) => path.join(sdkDir, e.file)),
  options: { ...config.options, noEmit: true },
});
const checker = program.getTypeChecker();
const srcDir = path.join(sdkDir, "src");

// ------------------------------------------------------------------------------------------------ model

type Kind = "class" | "interface" | "type" | "function" | "constant";

interface Doc {
  symbol: ts.Symbol;
  name: string;
  kind: Kind;
  decl: ts.Declaration;
  /** Entry points exporting this symbol, in ENTRIES order. */
  entries: Entry[];
  home: Entry;
  /** Output path relative to outDir, e.g. `sdk/sponsorkit.md`. */
  page: string;
  /** For functions and constants: the anchor on the module page. */
  anchor?: string;
}

const KIND_ORDER: Kind[] = ["class", "interface", "type", "function", "constant"];
const KIND_LABEL: Record<Kind, string> = {
  class: "Classes",
  interface: "Interfaces",
  type: "Type aliases",
  function: "Functions",
  constant: "Constants",
};
const KIND_PAGE_ORDER: Record<Kind, number> = { class: 10, interface: 20, type: 30, function: 40, constant: 50 };

function isInSrc(node: ts.Node): boolean {
  const f = node.getSourceFile().fileName;
  return path.resolve(f).startsWith(srcDir + path.sep);
}

function hasTag(symbol: ts.Symbol, tag: string): boolean {
  return symbol.getJsDocTags(checker).some((t) => t.name === tag);
}

function kindOf(decl: ts.Declaration): Kind | null {
  if (ts.isClassDeclaration(decl)) return "class";
  if (ts.isInterfaceDeclaration(decl)) return "interface";
  if (ts.isTypeAliasDeclaration(decl)) return "type";
  if (ts.isFunctionDeclaration(decl)) return "function";
  if (ts.isVariableDeclaration(decl)) return "constant";
  return null;
}

/** Contract slug: lowercase, every run outside [a-z0-9] → "-". */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "x"
  );
}

/** Contract anchor id: lowercase, runs outside [a-z0-9_] → "-". */
function anchorId(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "") || "x"
  );
}

const docs: Doc[] = [];
const bySymbol = new Map<ts.Symbol, Doc>();
const exportsByEntry = new Map<string, Doc[]>();

for (const entry of ENTRIES) {
  const sf = program.getSourceFile(path.join(sdkDir, entry.file));
  if (!sf) throw new Error(`Missing ${entry.file}`);
  const moduleSymbol = checker.getSymbolAtLocation(sf);
  if (!moduleSymbol) throw new Error(`${entry.file} is not a module`);
  const list: Doc[] = [];
  for (const exp of checker.getExportsOfModule(moduleSymbol)) {
    const symbol = exp.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exp) : exp;
    const decl = symbol.declarations?.find((d) => kindOf(d) !== null && isInSrc(d));
    if (!decl) continue;
    if (hasTag(symbol, "internal")) continue;
    let doc = bySymbol.get(symbol);
    if (!doc) {
      const kind = kindOf(decl) as Kind;
      doc = { symbol, name: symbol.getName(), kind, decl, entries: [], home: entry, page: "" };
      bySymbol.set(symbol, doc);
      docs.push(doc);
    }
    doc.entries.push(entry);
    list.push(doc);
  }
  exportsByEntry.set(entry.id, list);
}

// Assign pages: types get their own page in their home folder; functions and constants live on the module page.
{
  const used = new Map<string, Set<string>>();
  const sorted = [...docs].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  for (const d of sorted) {
    const folder = d.home.id;
    if (d.kind === "function" || d.kind === "constant") {
      d.page = `${folder}/index.md`;
      d.anchor = anchorId(d.name);
      continue;
    }
    const taken = used.get(folder) ?? new Set(["index"]);
    used.set(folder, taken);
    let base = slug(d.name);
    let n = 1;
    let candidate = base;
    while (taken.has(candidate)) candidate = `${base}-${++n}`;
    base = candidate;
    taken.add(base);
    d.page = `${folder}/${base}.md`;
  }
}

function sortKey(d: Doc): string {
  return `${ENTRIES.indexOf(d.home)}|${KIND_ORDER.indexOf(d.kind)}|${d.name.toLowerCase()}|${d.name}`;
}

// ------------------------------------------------------------------------------------------------ helpers

function rel(from: string, to: string, anchor?: string): string {
  let r = path.posix.relative(path.posix.dirname(from), to);
  if (!r) r = path.posix.basename(to);
  return anchor ? `${r}#${anchor}` : r;
}

function linkTo(from: string, d: Doc, label = d.name, member?: string): string {
  const anchor = member ? anchorId(member) : d.anchor;
  return `[\`${label}\`](${rel(from, d.page, anchor)})`;
}

/** Finds the documented symbol for a name as seen from `entry` (its own exports first, then the root). */
function lookup(name: string, entry: Entry): Doc | undefined {
  const own = exportsByEntry.get(entry.id)?.find((d) => d.name === name);
  if (own) return own;
  for (const e of ENTRIES) {
    const d = exportsByEntry.get(e.id)?.find((x) => x.name === name);
    if (d) return d;
  }
  return undefined;
}

/** Public member names (with their anchors) of a class or interface page. */
const memberAnchors = new Map<Doc, Map<string, string>>();

function resolveLinkName(text: string, from: string, entry: Entry): string {
  const [head, ...rest] = text.trim().split(/[.#]/);
  const target = head ? lookup(head, entry) : undefined;
  if (!target) return `\`${text.trim()}\``;
  const member = rest.join(".");
  if (member) {
    const anchors = memberAnchors.get(target);
    const anchor = anchors?.get(member);
    if (anchor) return `[\`${text.trim()}\`](${rel(from, target.page, anchor)})`;
  }
  return linkTo(from, target, text.trim());
}

/** Renders TypeScript's JSDoc display parts, turning `{@link X}` into Markdown links. */
function renderParts(parts: readonly ts.SymbolDisplayPart[] | undefined, from: string, entry: Entry): string {
  if (!parts) return "";
  let out = "";
  let i = 0;
  while (i < parts.length) {
    const p = parts[i] as ts.SymbolDisplayPart;
    if (p.kind === "link") {
      // {@link Name label}
      let name = "";
      let label = "";
      i++;
      while (i < parts.length && !(parts[i]?.kind === "link" && parts[i]?.text === "}")) {
        const q = parts[i] as ts.SymbolDisplayPart;
        if (q.kind === "linkName") name += q.text;
        else if (q.kind === "linkText") label += q.text;
        else name += q.text;
        i++;
      }
      i++; // closing "}"
      const linked = resolveLinkName(name, from, entry);
      out += label.trim() ? linked.replace(/\[`[^`]*`\]/, `[${label.trim()}]`) : linked;
      continue;
    }
    out += p.text;
    i++;
  }
  return stripSpecRefs(out).trim();
}

/**
 * Drops citations of the internal design documents, e.g. " (SPEC §7.5)" or " (SPEC §7.2, PROTOCOL §7.1)".
 * SPEC.md and PROTOCOL.md section numbers mean nothing to readers of the published reference.
 */
function stripSpecRefs(text: string): string {
  return text.replace(/\s*\((?:SPEC|PROTOCOL) §[\d.]+(?:\s+item\s+\d+)?(?:,\s*(?:SPEC|PROTOCOL) §[\d.]+(?:\s+item\s+\d+)?)*\)/g, "");
}

function docComment(symbol: ts.Symbol, from: string, entry: Entry): string {
  return renderParts(symbol.getDocumentationComment(checker), from, entry);
}

/**
 * The first sentence of a doc comment, for summary tables: ends at `.`, `!` or `?` followed by the end of
 * the paragraph or by whitespace and a capital letter, outside code spans and parentheses.
 */
function summary(text: string): string {
  const para =
    text
      .split(/\n\s*\n/)[0]
      ?.replace(/\s*\n\s*/g, " ")
      .trim() ?? "";
  let inCode = false;
  let depth = 0;
  let end = para.length;
  for (let i = 0; i < para.length; i++) {
    const c = para[i];
    if (c === "`") inCode = !inCode;
    if (inCode) continue;
    if (c === "(" || c === "[") depth++;
    else if ((c === ")" || c === "]") && depth > 0) depth--;
    else if (depth === 0 && (c === "." || c === "!" || c === "?")) {
      const rest = para.slice(i + 1);
      if (rest === "" || /^\s+[A-Z`[]/.test(rest)) {
        end = i + 1;
        break;
      }
    }
  }
  return para.slice(0, end).replace(/\|/g, "\\|");
}

/** Plain text for frontmatter descriptions: no links or code spans. */
function plain(text: string): string {
  return text
    .replace(/\\\|/g, "|")
    .replace(/\[`?([^`\]]*)`?\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1");
}

function tags(symbol: ts.Symbol, name: string): ts.JSDocTagInfo[] {
  return symbol.getJsDocTags(checker).filter((t) => t.name === name);
}

/** `@param` descriptions by parameter name (also `options.cacheTtl`-style names). */
function paramDocs(symbol: ts.Symbol, from: string, entry: Entry): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of tags(symbol, "param")) {
    const nameParts = t.text?.filter((p) => p.kind === "parameterName") ?? [];
    const name = nameParts.map((p) => p.text).join("");
    const rest = (t.text ?? []).filter((p) => p.kind !== "parameterName");
    if (name) map.set(name, renderParts(rest, from, entry).replace(/^[\s-]+/, ""));
  }
  return map;
}

function examples(symbol: ts.Symbol, from: string, entry: Entry): string[] {
  return tags(symbol, "example").map((t) => renderParts(t.text, from, entry));
}

/** Source text of a declaration without its body, dedented. */
function signatureText(node: ts.Node): string {
  const sf = node.getSourceFile();
  const start = node.getStart(sf);
  let end = node.getEnd();
  const body = ts.isFunctionLike(node) && "body" in node && (node as { body?: ts.Node }).body ? (node as { body: ts.Node }).body : undefined;
  if (body) end = body.getStart(sf);
  if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
    const brace = node.getChildren(sf).find((c) => c.kind === ts.SyntaxKind.OpenBraceToken);
    if (brace) end = brace.getStart(sf);
  }
  let text = sf.text
    .slice(start, end)
    .trim()
    .replace(/^export\s+/, "");
  if (ts.isVariableDeclaration(node)) {
    const list = node.parent;
    const keyword = list.flags & ts.NodeFlags.Const ? "const" : list.flags & ts.NodeFlags.Let ? "let" : "var";
    const typeText = node.type ? node.type.getText(sf) : checker.typeToString(checker.getTypeAtLocation(node));
    const init = node.initializer?.getText(sf);
    text = `${keyword} ${node.name.getText(sf)}: ${typeText}${init && init.length <= 160 && !init.includes("\n") ? ` = ${init}` : ""}`;
  }
  if (ts.isPropertyDeclaration(node)) text = text.replace(/^(.*?\w)!(\s*:)/, "$1$2");
  text = text.replace(/;$/, "");
  const col = sf.getLineAndCharacterOfPosition(start).character;
  const lines = text.split("\n");
  return lines
    .map((line, i) => (i === 0 ? line : line.startsWith(" ".repeat(col)) ? line.slice(col) : line.trimStart()))
    .join("\n")
    .replace(/\s+$/, "");
}

function sourceRef(node: ts.Node): string {
  const sf = node.getSourceFile();
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  return `${path.relative(repoDir, sf.fileName).split(path.sep).join("/")}#L${line}`;
}

function codeBlock(text: string): string {
  return `\`\`\`ts\n${text}\n\`\`\``;
}

function yamlString(s: string): string {
  return JSON.stringify(s);
}

function frontmatter(fields: Record<string, string | number | boolean | undefined>): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    lines.push(`${k}: ${typeof v === "string" ? yamlString(v) : String(v)}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

/** Escapes a table cell. */
function cell(s: string): string {
  return s.replace(/\r?\n\s*/g, " ").replace(/\|/g, "\\|");
}

/** Code span that survives table cells and inner backticks. */
function code(s: string): string {
  const t = s.replace(/\s*\n\s*/g, " ");
  return t.includes("`") ? `\`\` ${t} \`\`` : `\`${t}\``;
}

const docNames = () => new Set(docs.map((d) => d.name));

/** Links to documented types mentioned in a piece of TypeScript (for "See also" lines). */
function referencedTypes(typeText: string, from: string, entry: Entry, self?: Doc): string[] {
  const names = docNames();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of typeText.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
    const n = m[0];
    if (seen.has(n) || !names.has(n)) continue;
    seen.add(n);
    const d = lookup(n, entry);
    if (!d || d === self || d.kind === "function") continue;
    out.push(linkTo(from, d));
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ members

interface Member {
  name: string;
  anchor: string;
  group: "constructor" | "property" | "method" | "accessor";
  isStatic: boolean;
  decls: ts.Declaration[];
  symbol: ts.Symbol;
  /** The class/interface that declares it, when it is not the documented type itself. */
  inheritedFrom?: Doc;
}

function modifierFlags(d: ts.Declaration): ts.ModifierFlags {
  return ts.getCombinedModifierFlags(d);
}

function isPublicMember(d: ts.Declaration): boolean {
  const f = modifierFlags(d);
  if (f & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) return false;
  const name = ts.getNameOfDeclaration(d);
  if (name && ts.isPrivateIdentifier(name)) return false;
  return isInSrc(d);
}

function ownerDoc(d: ts.Declaration): Doc | undefined {
  const parent = d.parent;
  if (!parent) return undefined;
  const name = (parent as unknown as { name?: ts.Node }).name;
  const sym = name ? checker.getSymbolAtLocation(name) : undefined;
  return sym ? bySymbol.get(sym) : undefined;
}

function memberGroup(d: ts.Declaration): Member["group"] | null {
  if (ts.isConstructorDeclaration(d)) return "constructor";
  if (ts.isMethodDeclaration(d) || ts.isMethodSignature(d)) return "method";
  if (ts.isGetAccessorDeclaration(d) || ts.isSetAccessorDeclaration(d)) return "accessor";
  if (ts.isPropertyDeclaration(d) || ts.isPropertySignature(d)) return "property";
  return null;
}

function collectMembers(doc: Doc): Member[] {
  const members: Member[] = [];
  const add = (symbols: ts.Symbol[], isStatic: boolean) => {
    for (const s of symbols) {
      if (s.getName() === "prototype") continue;
      const decls = (s.declarations ?? []).filter(isPublicMember);
      if (!decls.length || hasTag(s, "internal")) continue;
      const group = memberGroup(decls[0] as ts.Declaration);
      if (!group) continue;
      const owner = ownerDoc(decls[0] as ts.Declaration);
      members.push({
        name: s.getName(),
        anchor: "",
        group,
        isStatic,
        decls,
        symbol: s,
        inheritedFrom: owner && owner !== doc ? owner : undefined,
      });
    }
  };
  if (doc.kind === "class") {
    const decl = doc.decl as ts.ClassDeclaration;
    const ctor = decl.members.find(ts.isConstructorDeclaration);
    if (ctor && isPublicMember(ctor)) {
      members.push({ name: "constructor", anchor: "", group: "constructor", isStatic: false, decls: [ctor], symbol: doc.symbol });
    }
    add(checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(doc.symbol)), false);
    add(checker.getPropertiesOfType(checker.getTypeOfSymbolAtLocation(doc.symbol, decl)), true);
  } else {
    add(checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(doc.symbol)), false);
  }
  const pos = (m: Member) => {
    const d = m.decls[0] as ts.Declaration;
    return `${m.inheritedFrom ? 1 : 0}|${d.getSourceFile().fileName}|${String(d.getStart()).padStart(8, "0")}`;
  };
  members.sort((a, b) => pos(a).localeCompare(pos(b)));
  const used = new Set<string>();
  for (const m of members) {
    let id = anchorId(m.isStatic ? `static-${m.name}` : m.name);
    if (m.isStatic && !members.some((o) => !o.isStatic && o.name === m.name)) id = anchorId(m.name);
    let n = 1;
    const base = id;
    while (used.has(id)) id = `${base}-${++n}`;
    used.add(id);
    m.anchor = id;
  }
  return members;
}

function parametersOf(node: ts.Node): readonly ts.ParameterDeclaration[] {
  return ts.isFunctionLike(node) ? node.parameters : [];
}

function renderParams(node: ts.SignatureDeclaration, symbol: ts.Symbol, from: string, entry: Entry): string[] {
  const params = parametersOf(node);
  if (!params.length) return [];
  const pdocs = paramDocs(symbol, from, entry);
  const sf = node.getSourceFile();
  const rows = ["| Parameter | Type | Default | Description |", "|---|---|---|---|"];
  for (const p of params) {
    const name = p.name.getText(sf);
    const type = p.type ? p.type.getText(sf) : checker.typeToString(checker.getTypeAtLocation(p));
    const def = p.initializer ? code(p.initializer.getText(sf)) : p.questionToken ? "optional" : "required";
    let desc = pdocs.get(name) ?? "";
    for (const [k, v] of pdocs) if (k.startsWith(`${name}.`)) desc += `${desc ? " " : ""}\`${k.slice(name.length + 1)}\`: ${v}`;
    const refs = referencedTypes(type, from, entry);
    if (refs.length && !desc.includes("](")) desc += `${desc ? " " : ""}See ${refs.join(", ")}.`;
    rows.push(`| \`${name}\` | ${cell(code(type))} | ${cell(def)} | ${cell(desc)} |`);
  }
  return ["**Parameters**", "", ...rows, ""];
}

function renderReturns(node: ts.SignatureDeclaration, symbol: ts.Symbol, from: string, entry: Entry): string[] {
  if (ts.isConstructorDeclaration(node) || ts.isSetAccessorDeclaration(node)) return [];
  const sf = node.getSourceFile();
  let type: string;
  if (node.type) type = node.type.getText(sf);
  else {
    const sig = checker.getSignatureFromDeclaration(node);
    type = sig ? checker.typeToString(checker.getReturnTypeOfSignature(sig)) : "";
  }
  if (!type) return [];
  const returnsTag = tags(symbol, "returns")[0] ?? tags(symbol, "return")[0];
  const text = returnsTag ? renderParts(returnsTag.text, from, entry) : "";
  const refs = referencedTypes(type, from, entry);
  const see = refs.length ? ` (${refs.join(", ")})` : "";
  return [`**Returns** ${code(type)}${see}${text ? `: ${text}` : ""}`, ""];
}

function renderExamples(symbol: ts.Symbol, from: string, entry: Entry, heading: string): string[] {
  const out: string[] = [];
  for (const ex of examples(symbol, from, entry)) {
    out.push(heading, "", ex.includes("```") ? ex : codeBlock(ex), "");
  }
  return out;
}

function renderThrows(symbol: ts.Symbol, from: string, entry: Entry): string[] {
  const t = tags(symbol, "throws");
  return t.length ? t.flatMap((x) => [`**Throws** ${renderParts(x.text, from, entry)}`, ""]) : [];
}

function renderMember(doc: Doc, m: Member, from: string): string[] {
  const entry = doc.home;
  const out: string[] = [];
  const label =
    m.group === "constructor"
      ? `new ${doc.name}()`
      : m.group === "method"
        ? `${m.isStatic ? `${doc.name}.` : ""}${m.name}()`
        : `${m.isStatic ? `${doc.name}.` : ""}${m.name}`;
  out.push(`### ${label} {#${m.anchor}}`, "");
  const sigs = m.decls.map((d) => {
    let s = signatureText(d);
    if (m.group === "constructor") s = s.replace(/^constructor/, `new ${doc.name}`);
    return s;
  });
  out.push(codeBlock(sigs.join("\n")), "");
  const text = m.group === "constructor" ? docCommentOfNode(m.decls[0] as ts.Declaration, from, entry) : docComment(m.symbol, from, entry);
  if (text) out.push(text, "");
  if (m.inheritedFrom) out.push(`_Inherited from ${linkTo(from, m.inheritedFrom, `${m.inheritedFrom.name}.${m.name}`, m.name)}._`, "");
  const first = m.decls[0] as ts.Declaration;
  if (m.group === "method" || m.group === "constructor") {
    const sym = m.group === "constructor" ? ctorSymbol(first) : m.symbol;
    out.push(...renderParams(first as ts.SignatureDeclaration, sym ?? m.symbol, from, entry));
    out.push(...renderReturns(first as ts.SignatureDeclaration, sym ?? m.symbol, from, entry));
    if (sym) out.push(...renderThrows(sym, from, entry));
    if (sym) out.push(...renderExamples(sym, from, entry, "**Example**"));
  } else {
    const typeNode = (first as { type?: ts.TypeNode }).type;
    const typeText = typeNode ? typeNode.getText(first.getSourceFile()) : "";
    const refs = referencedTypes(typeText, from, entry, doc);
    if (refs.length) out.push(`**Type:** ${refs.join(", ")}`, "");
    out.push(...renderExamples(m.symbol, from, entry, "**Example**"));
  }
  return out;
}

/** Doc comment attached to a declaration node (constructors have no symbol of their own). */
function docCommentOfNode(node: ts.Declaration, from: string, entry: Entry): string {
  const sym = ctorSymbol(node);
  return sym ? docComment(sym, from, entry) : "";
}

function ctorSymbol(node: ts.Declaration): ts.Symbol | undefined {
  if (!ts.isConstructorDeclaration(node)) return undefined;
  // The signature's documentation is exposed through the signature object.
  const sig = checker.getSignatureFromDeclaration(node);
  if (!sig) return undefined;
  const fake = {
    getDocumentationComment: (c: ts.TypeChecker) => sig.getDocumentationComment(c),
    getJsDocTags: () => sig.getJsDocTags(),
  } as unknown as ts.Symbol;
  return fake;
}

// ------------------------------------------------------------------------------------------------ pages

const files = new Map<string, string>();

function writePage(file: string, content: string): void {
  if (files.has(file)) throw new Error(`Duplicate page ${file}`);
  files.set(file, `${content.replace(/\n{3,}/g, "\n\n").trimEnd()}\n`);
}

function importLine(d: Doc): string {
  const e = d.entries.includes(d.home) ? d.home : (d.entries[0] as Entry);
  const typeOnly = d.kind === "interface" || d.kind === "type";
  return `import ${typeOnly ? "type " : ""}{ ${d.name} } from "${e.specifier}";`;
}

function typePage(d: Doc): void {
  const from = d.page;
  const entry = d.home;
  const text = docComment(d.symbol, from, entry);
  const out: string[] = [];
  const kindWord = d.kind === "type" ? "Type alias" : d.kind === "class" ? "Class" : "Interface";
  const description = summary(text) || `${kindWord} ${d.name}.`;
  out.push(
    frontmatter({
      title: d.name,
      description: plain(description),
      kind: d.kind,
      symbol: `${entry.specifier}.${d.name}`,
      source: sourceRef(d.decl),
      order: KIND_PAGE_ORDER[d.kind],
    }),
  );
  if (text) out.push(text, "");
  out.push(codeBlock(`${importLine(d)}\n\n${signatureText(d.decl)}${d.kind === "type" ? "" : " { … }"}`), "");
  out.push(`${kindWord}, exported from ${d.entries.map((e) => linkModule(from, e)).join(", ")}.`, "");

  if (d.kind === "class") {
    const heritage = (d.decl as ts.ClassDeclaration).heritageClauses?.flatMap((h) => h.types.map((t) => t.expression.getText())) ?? [];
    const bases = heritage.map((n) => docFor(n, d.decl)).filter((x): x is Doc => !!x);
    if (bases.length) out.push(`Extends ${bases.map((b) => linkTo(from, b)).join(", ")}.`, "");
    const subclasses = docs.filter(
      (o) =>
        o.kind === "class" && (o.decl as ts.ClassDeclaration).heritageClauses?.some((h) => h.types.some((t) => docFor(t.expression.getText(), o.decl) === d)),
    );
    if (subclasses.length) out.push(`Extended by ${subclasses.map((s) => `${linkTo(from, s)} (\`${s.home.specifier}\`)`).join(", ")}.`, "");
  }
  if (d.kind === "interface") {
    const heritage = (d.decl as ts.InterfaceDeclaration).heritageClauses?.flatMap((h) => h.types.map((t) => t.expression.getText())) ?? [];
    const bases = heritage.map((n) => docFor(n, d.decl)).filter((x): x is Doc => !!x);
    if (bases.length) out.push(`Extends ${bases.map((b) => linkTo(from, b)).join(", ")}.`, "");
  }
  if (d.kind === "type") {
    const typeNode = (d.decl as ts.TypeAliasDeclaration).type;
    const refs = referencedTypes(typeNode.getText(), from, entry, d);
    if (refs.length) out.push(`See also: ${refs.join(", ")}.`, "");
  }
  out.push(...renderExamples(d.symbol, from, entry, "## Example"));

  if (d.kind === "class" || d.kind === "interface") {
    const members = collectMembersCached(d);
    const groups: [string, (m: Member) => boolean][] = [
      ["Constructors", (m) => m.group === "constructor"],
      ["Properties", (m) => !m.isStatic && (m.group === "property" || m.group === "accessor")],
      ["Methods", (m) => !m.isStatic && m.group === "method"],
      ["Static members", (m) => m.isStatic],
    ];
    for (const [title, pred] of groups) {
      const list = members.filter(pred);
      if (!list.length) continue;
      out.push(`## ${title}`, "");
      for (const m of list) out.push(...renderMember(d, m, from));
    }
  }
  writePage(d.page, out.join("\n"));
}

function docFor(name: string, at: ts.Node): Doc | undefined {
  const sym = resolveAlias(name, at);
  return sym ? bySymbol.get(sym) : undefined;
}

function resolveAlias(name: string, at: ts.Node): ts.Symbol | undefined {
  const sf = at.getSourceFile();
  const sym = checker.getSymbolsInScope(sf, ts.SymbolFlags.Type | ts.SymbolFlags.Value | ts.SymbolFlags.Alias).find((s) => s.getName() === name);
  if (!sym) return undefined;
  return sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
}

const memberCache = new Map<Doc, Member[]>();
function collectMembersCached(d: Doc): Member[] {
  let m = memberCache.get(d);
  if (!m) {
    m = collectMembers(d);
    memberCache.set(d, m);
    memberAnchors.set(d, new Map(m.map((x) => [x.group === "constructor" ? "constructor" : x.name, x.anchor])));
  }
  return m;
}

function linkModule(from: string, e: Entry): string {
  return `[\`${e.specifier}\`](${rel(from, `${e.id}/index.md`)})`;
}

function moduleDoc(e: Entry): { text: string; example: string } {
  const sf = program.getSourceFile(path.join(sdkDir, e.file)) as ts.SourceFile;
  const ranges = ts.getLeadingCommentRanges(sf.text, 0) ?? [];
  const r = ranges.find((x) => sf.text.slice(x.pos, x.pos + 3) === "/**");
  if (!r) return { text: "", example: "" };
  const raw = sf.text
    .slice(r.pos + 3, r.end - 2)
    .split("\n")
    .map((l) => l.replace(/^\s*\* ?/, ""))
    .join("\n")
    .trim();
  const [text = "", example = ""] = raw.split(/^@example\s*$/m);
  return { text: stripSpecRefs(text).trim(), example: example.trim() };
}

function functionSection(d: Doc, from: string): string[] {
  const out: string[] = [];
  const entry = d.home;
  out.push(`### ${d.name}${d.kind === "function" ? "()" : ""} {#${d.anchor}}`, "");
  out.push(codeBlock(signatureText(d.decl)), "");
  const text = docComment(d.symbol, from, entry);
  if (text) out.push(text, "");
  if (d.entries.length > 1)
    out.push(
      `Also exported from ${d.entries
        .filter((e) => e !== d.home)
        .map((e) => `\`${e.specifier}\``)
        .join(", ")}.`,
      "",
    );
  if (d.kind === "function") {
    const decl = d.decl as ts.FunctionDeclaration;
    out.push(...renderParams(decl, d.symbol, from, entry));
    out.push(...renderReturns(decl, d.symbol, from, entry));
    out.push(...renderThrows(d.symbol, from, entry));
  } else {
    const decl = d.decl as ts.VariableDeclaration;
    const typeText = decl.type ? decl.type.getText() : checker.typeToString(checker.getTypeAtLocation(decl));
    const refs = referencedTypes(typeText, from, entry);
    if (refs.length) out.push(`**Type:** ${refs.join(", ")}`, "");
  }
  out.push(...renderExamples(d.symbol, from, entry, "**Example**"));
  out.push(`[View source](https://github.com/sponsorkit/sponsorkit.io/blob/main/${sourceRef(d.decl)})`, "");
  return out;
}

function modulePage(e: Entry): void {
  const from = `${e.id}/index.md`;
  const list = exportsByEntry.get(e.id) ?? [];
  const { text, example } = moduleDoc(e);
  const out: string[] = [];
  out.push(
    frontmatter({
      title: e.specifier,
      description: e.summary.replace(/`/g, ""),
      kind: "module",
      symbol: e.specifier,
      source: `sdks/js/${e.file}`,
      sidebar_label: "Overview",
    }),
  );
  if (text) out.push(text, "");
  out.push(codeBlock(`import { … } from "${e.specifier}";`), "");
  if (example) out.push("## Example", "", example.includes("```") ? example : codeBlock(example), "");

  out.push("## Exports", "");
  const own = list.filter((d) => d.home === e);
  const shared = list.filter((d) => d.home !== e);
  for (const kind of KIND_ORDER) {
    const items = own.filter((d) => d.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
    if (!items.length) continue;
    out.push(`### ${KIND_LABEL[kind]}`, "", "| Name | Summary |", "|---|---|");
    for (const d of items) out.push(`| ${linkTo(from, d)} | ${cell(summary(docComment(d.symbol, from, e)))} |`);
    out.push("");
  }
  if (shared.length) {
    const homes = [...new Set(shared.map((d) => d.home))];
    out.push(
      "### Re-exported",
      "",
      `This entry point also exports these symbols, documented under ${homes.map((h) => linkModule(from, h)).join(", ")}:`,
      "",
      shared
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((d) => linkTo(from, d))
        .join(", "),
      "",
    );
  }

  const fns = own.filter((d) => d.kind === "function").sort((a, b) => a.name.localeCompare(b.name));
  const consts = own.filter((d) => d.kind === "constant").sort((a, b) => a.name.localeCompare(b.name));
  if (fns.length) {
    out.push("## Functions", "");
    for (const d of fns) out.push(...functionSection(d, from));
  }
  if (consts.length) {
    out.push("## Constants", "");
    for (const d of consts) out.push(...functionSection(d, from));
  }
  writePage(from, out.join("\n"));
  files.set(`${e.id}/_section.md`, `${frontmatter({ title: e.specifier, order: e.order })}`);
}

function indexPage(): void {
  const from = "index.md";
  const out: string[] = [];
  out.push(
    frontmatter({
      title: "JavaScript / TypeScript API reference",
      description: `Every public class, interface, type, function and constant of ${pkg.name} ${pkg.version}, generated from the TypeScript source.`,
      kind: "index",
      symbol: pkg.name,
    }),
  );
  out.push(
    `Generated from the TypeScript source and doc comments of \`${pkg.name}\` ${pkg.version}. For installation, sign-in flows and worked examples, see the [JavaScript / TypeScript guide](/docs/languages/js).`,
    "",
    codeBlock(`npm install ${pkg.name}`).replace("```ts", "```bash"),
    "",
    "## Entry points",
    "",
    "The package has four entry points. Pick one by where your code runs; they share the same types, error codes and result shape.",
    "",
    "| Import | For | Main export |",
    "|---|---|---|",
  );
  const main: Record<string, string> = { sdk: "Sponsorkit", node: "Sponsorkit", server: "verifySession", elements: "SponsorkitButtonElement" };
  for (const e of ENTRIES) {
    const d = (exportsByEntry.get(e.id) ?? []).find((x) => x.name === main[e.id] && x.home === e);
    out.push(`| ${linkModule(from, e)} | ${cell(e.summary)} | ${d ? linkTo(from, d) : ""} |`);
  }
  out.push("");
  out.push("## All symbols", "");
  for (const kind of KIND_ORDER) {
    const items = docs.filter((d) => d.kind === kind).sort((a, b) => a.name.localeCompare(b.name) || ENTRIES.indexOf(a.home) - ENTRIES.indexOf(b.home));
    if (!items.length) continue;
    out.push(`### ${KIND_LABEL[kind]}`, "", "| Name | Entry point | Summary |", "|---|---|---|");
    for (const d of items) out.push(`| ${linkTo(from, d)} | \`${d.home.specifier}\` | ${cell(summary(docComment(d.symbol, from, d.home)))} |`);
    out.push("");
  }
  out.push(
    "## Conventions",
    "",
    "- Durations in options are **seconds** (`cacheTtl`, `signInTimeout`, `requestTimeout`, `timeout`); amounts are **minor units** (cents) with an ISO 4217 currency.",
    "- Every error the SDK throws is a [`SponsorkitError`](sdk/sponsorkiterror.md) with a [`code`](sdk/sponsorkiterrorcode.md). `getFinancialContribution()` never throws for network or server problems. See [Error contract](/docs/concepts/error-contract).",
    "- Cancellation uses the standard `AbortSignal`.",
    "",
  );
  writePage(from, out.join("\n"));
}

// Member anchors first, so {@link Type.member} can resolve on any page.
for (const d of docs) if (d.kind === "class" || d.kind === "interface") collectMembersCached(d);
for (const d of docs) if (d.kind === "class" || d.kind === "interface" || d.kind === "type") typePage(d);
for (const e of ENTRIES) modulePage(e);
indexPage();

files.set(
  "_meta.json",
  `${JSON.stringify(
    {
      lang: "js",
      package: pkg.name,
      version: pkg.version,
      generator: "sdks/js/scripts/gen-docs.ts (TypeScript compiler API)",
    },
    null,
    2,
  )}\n`,
);

for (const [file, content] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const target = path.join(outDir, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}
console.log(`gen-docs: wrote ${files.size} files (${docs.length} symbols) to ${outDir}`);
