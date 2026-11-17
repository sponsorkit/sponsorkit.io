#!/usr/bin/env bun
/**
 * Validates a generator's output against web/content/docs/REFERENCE-CONTRACT.md, without `next build`.
 *
 *   bun run --cwd web docs:validate <lang> [--dir <folder>]
 *
 * <lang> is one of js, dotnet, python, go, rust. --dir defaults to web/.generated/reference/<lang>.
 * Exit code 1 on any error (warnings don't fail).
 */
import path from "node:path";
import { REF_LANGS, docsDirs, isRefLang } from "../src/lib/docs/config";
import { formatValidation, validateReference } from "../src/lib/docs/validate-reference";

const args = process.argv.slice(2);
const lang = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--dir");
const dirIdx = args.indexOf("--dir");
if (!lang || !isRefLang(lang)) {
  console.error(`usage: validate-generated.ts <${REF_LANGS.join("|")}> [--dir <folder>]`);
  process.exit(2);
}
const dirs = docsDirs();
const dir = dirIdx >= 0 && args[dirIdx + 1] ? path.resolve(process.env.INIT_CWD ?? process.cwd(), args[dirIdx + 1]!) : path.join(dirs.generatedDir, lang);
const result = await validateReference(lang, dir, { webDir: dirs.webDir });
console.log(formatValidation(result));
process.exit(result.errors.length ? 1 : 0);
