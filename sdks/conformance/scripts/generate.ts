/** Writes every generated file of the conformance kit. Run with `bun run generate`. */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { generateAll } from "../src/generate";

const root = join(import.meta.dir, "..");
const files = await generateAll();
for (const [rel, content] of Object.entries(files)) {
  const path = join(root, rel);
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, content);
  process.stderr.write(`wrote ${rel}\n`);
}
