/** File storage for native runtimes (PROTOCOL §8). */
import { readFileSync } from "node:fs";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { SponsorkitStorage } from "../storage";
import { base64url } from "../targets";

/**
 * The per-user Sponsorkit directory (SPEC §7.6):
 * `$XDG_CONFIG_HOME/sponsorkit` (Linux, default `~/.config`), `~/Library/Application Support/sponsorkit` (macOS),
 * `%APPDATA%\sponsorkit` (Windows).
 */
export function defaultStorageDir(env: Record<string, string | undefined> = process.env, platform: string = process.platform): string {
  if (platform === "win32") return join(env.APPDATA || join(homedir(), "AppData", "Roaming"), "sponsorkit");
  if (platform === "darwin") return join(homedir(), "Library", "Application Support", "sponsorkit");
  const xdg = env.XDG_CONFIG_HOME;
  return join(xdg?.startsWith("/") ? xdg : join(homedir(), ".config"), "sponsorkit");
}

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
        return readFileSync(file(hash), "utf8");
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
