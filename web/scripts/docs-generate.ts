#!/usr/bin/env bun
/**
 * Runs each SDK's API reference generator and validates its output.
 *
 *   bun run --cwd web docs:generate [--strict] [--no-stubs] [--only <lang>[,<lang>…]]
 *
 * For each language: runs `bash sdks/<lang>/scripts/gen-docs.sh <tmp-dir>` with cwd sdks/<lang>,
 * validates <tmp-dir> (see validate-generated.ts) and, if valid, replaces
 * web/.generated/reference/<lang> with it.
 *
 * Without --strict a failing generator is reported and skipped (the site then shows the previous
 * output, or a placeholder). With --strict any failure exits 1. --no-stubs also rejects output marked
 * `"stub": true` in _meta.json.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { REF_LANGS, type RefLang, docsDirs, generatorEntrypoint, isRefLang } from "../src/lib/docs/config";
import { formatValidation, validateReference } from "../src/lib/docs/validate-reference";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const noStubs = args.includes("--no-stubs");
const only: RefLang[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  const value = a === "--only" ? args[++i] : a.startsWith("--only=") ? a.slice(7) : null;
  if (value === null) {
    if (!["--strict", "--no-stubs"].includes(a)) {
      console.error(`unknown argument ${a}`);
      process.exit(2);
    }
    continue;
  }
  for (const l of (value ?? "").split(",").filter(Boolean)) {
    if (!isRefLang(l)) {
      console.error(`unknown language "${l}" (expected ${REF_LANGS.join(", ")})`);
      process.exit(2);
    }
    only.push(l);
  }
}

const dirs = docsDirs();
const langs = only.length ? only : [...REF_LANGS];
mkdirSync(dirs.generatedDir, { recursive: true });
const failures: string[] = [];

for (const lang of langs) {
  const entry = path.join(dirs.repoDir, generatorEntrypoint(lang));
  const cwd = path.join(dirs.repoDir, "sdks", lang);
  const out = path.join(dirs.generatedDir, lang);
  const tmp = path.join(dirs.generatedDir, `.tmp-${lang}`);
  console.log(`\n▶ ${lang}: bash ${generatorEntrypoint(lang)} ${path.relative(dirs.repoDir, tmp)}`);
  if (!existsSync(entry)) {
    failures.push(`${lang}: generator entrypoint ${generatorEntrypoint(lang)} not found`);
    console.error(`  ✖ ${failures.at(-1)}`);
    continue;
  }
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const run = spawnSync("bash", [entry, tmp], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, SPONSORKIT_DOCS_OUT: tmp, SPONSORKIT_DOCS_LANG: lang, SPONSORKIT_REPO_ROOT: dirs.repoDir },
  });
  if (run.status !== 0) {
    failures.push(`${lang}: generator exited with ${run.status ?? run.signal ?? run.error?.message}`);
    console.error(`  ✖ ${failures.at(-1)}`);
    rmSync(tmp, { recursive: true, force: true });
    continue;
  }
  const result = await validateReference(lang, tmp, { webDir: dirs.webDir });
  console.log(formatValidation(result).replace(tmp, path.relative(dirs.repoDir, tmp)));
  if (noStubs && result.stub) result.errors.push("stub output rejected (--no-stubs)");
  if (result.errors.length) {
    failures.push(`${lang}: output failed validation (${result.errors.length} error(s))`);
    rmSync(tmp, { recursive: true, force: true });
    continue;
  }
  rmSync(out, { recursive: true, force: true });
  renameSync(tmp, out);
  console.log(`  ✔ ${path.relative(dirs.repoDir, out)}`);
}

if (failures.length) {
  console.error(`\n${failures.length} generator(s) failed:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  if (strict) process.exit(1);
  console.error("(not --strict: continuing; the site shows placeholders for missing languages)");
}
