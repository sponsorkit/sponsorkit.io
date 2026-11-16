/** File storage for native runtimes (PROTOCOL §8). */
import { readFileSync } from "node:fs";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join, posix, resolve, win32 } from "node:path";
import type { SponsorkitStorage } from "../storage";
import { base64url } from "../targets";

/**
 * The per-user Sponsorkit directory (SPEC §7.6):
 * `$XDG_CONFIG_HOME/sponsorkit` (Linux, default `$HOME/.config`), `$HOME/Library/Application Support/sponsorkit` (macOS),
 * `%APPDATA%\sponsorkit` (Windows, default `%USERPROFILE%\AppData\Roaming`).
 *
 * Returns `null` when no per-user directory can be determined (e.g. `HOME` is unset or not absolute);
 * the client then keeps its state in memory and never falls back to the current directory (PROTOCOL §7.0).
 */
export function defaultStorageDir(env: Record<string, string | undefined> = process.env, platform: string = process.platform): string | null {
  const path = platform === "win32" ? win32 : posix;
  const abs = (p: string | undefined): p is string => !!p && path.isAbsolute(p);
  if (platform === "win32") {
    if (abs(env.APPDATA)) return path.join(env.APPDATA, "sponsorkit");
    return abs(env.USERPROFILE) ? path.join(env.USERPROFILE, "AppData", "Roaming", "sponsorkit") : null;
  }
  if (platform === "darwin") return abs(env.HOME) ? path.join(env.HOME, "Library", "Application Support", "sponsorkit") : null;
  if (abs(env.XDG_CONFIG_HOME)) return path.join(env.XDG_CONFIG_HOME, "sponsorkit");
  return abs(env.HOME) ? path.join(env.HOME, ".config", "sponsorkit") : null;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

const instances = new Map<string, SponsorkitStorage>();

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (e) {
      // Windows can refuse to replace a file another process has open; retry briefly.
      const code = (e as NodeJS.ErrnoException).code;
      if (attempt >= 5 || (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY")) throw e;
      await new Promise((r) => setTimeout(r, 10 * (attempt + 1)));
    }
  }
}

/**
 * Stores one `<targets_hash>.json` file per target set in `dir`. The directory
 * is created with mode 0700 on first write and files are written with mode
 * 0600 via a temp file and an atomic rename. Instances are shared per directory.
 */
export function fileStorage(dir: string): SponsorkitStorage {
  const root = resolve(dir);
  const existing = instances.get(root);
  if (existing) return existing;
  const file = (hash: string) => join(root, `${hash}.json`);
  const storage: SponsorkitStorage = {
    read(hash) {
      try {
        // Invalid UTF-8 makes the document unparseable, so it counts as absent (PROTOCOL §7.0).
        return utf8.decode(readFileSync(file(hash)));
      } catch {
        return null;
      }
    },
    async write(hash, json) {
      const created = await mkdir(root, { recursive: true, mode: 0o700 });
      if (created !== undefined && process.platform !== "win32") await chmod(root, 0o700).catch(() => undefined);
      const target = file(hash);
      const tmp = `${target}.${base64url(globalThis.crypto.getRandomValues(new Uint8Array(6)))}.tmp`;
      try {
        await writeFile(tmp, json, { mode: 0o600, flag: "wx" });
        await renameWithRetry(tmp, target);
      } catch (e) {
        await rm(tmp, { force: true }).catch(() => undefined);
        throw e;
      }
    },
  };
  instances.set(root, storage);
  return storage;
}
