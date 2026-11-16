/**
 * Local storage (PROTOCOL §8): one JSON document per target set, keyed by `targets_hash`.
 */
import { isSessionToken } from "./http";
import type { ContributionResult, NagState, StorageFile } from "./types";
import { isObject, parseIsoTimestamp } from "./util";

/**
 * Where the SDK keeps its per-target-set document. Implementations store an
 * opaque JSON string per `targetsHash`.
 *
 * Built in: `localStorageAdapter()` (browsers), `memoryStorage()`, and
 * `fileStorage(dir)` from `@sponsorkit/sdk/node`.
 */
export interface SponsorkitStorage {
  /** The stored JSON for `targetsHash`, or `null`. */
  read(targetsHash: string): string | null | Promise<string | null>;
  /** Replaces the stored JSON for `targetsHash`. Should be atomic. */
  write(targetsHash: string, json: string): void | Promise<void>;
}

/** The subset of the Web Storage API used by {@link localStorageAdapter}. */
export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Wraps a Web Storage object (default: `localStorage`) using the key `sponsorkit:<targets_hash>`. */
export function localStorageAdapter(storage?: WebStorageLike): SponsorkitStorage {
  const get = (): WebStorageLike => {
    const s = storage ?? (globalThis as { localStorage?: WebStorageLike }).localStorage;
    if (!s) throw new Error("localStorage is not available");
    return s;
  };
  return {
    read: (hash) => {
      try {
        return get().getItem(`sponsorkit:${hash}`);
      } catch {
        return null;
      }
    },
    write: (hash, json) => get().setItem(`sponsorkit:${hash}`, json),
  };
}

const sharedMemory = new Map<string, string>();

/** In-memory storage. Without an argument, all instances in this process share one map. */
export function memoryStorage(map: Map<string, string> = sharedMemory): SponsorkitStorage {
  return {
    read: (hash) => map.get(hash) ?? null,
    write: (hash, json) => {
      map.set(hash, json);
    },
  };
}

/** True if `localStorage` is usable. */
export function hasLocalStorage(): boolean {
  try {
    const s = (globalThis as { localStorage?: WebStorageLike }).localStorage;
    if (!s) return false;
    s.getItem("sponsorkit:probe");
    return true;
  } catch {
    return false;
  }
}

function isIsoDate(v: unknown): v is string {
  return parseIsoTimestamp(v) !== null;
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** A cached contribution the SDK can filter and compare without crashing. */
function isStoredContribution(c: unknown): boolean {
  return (
    isObject(c) &&
    typeof c.id === "string" &&
    typeof c.provider === "string" &&
    typeof c.status === "string" &&
    typeof c.kind === "string" &&
    isObject(c.amount)
  );
}

/** A cached ContributionResult whose parts all have the expected types (PROTOCOL §7.0). */
function isStoredResult(r: unknown): r is ContributionResult {
  return (
    isObject(r) &&
    typeof r.signedIn === "boolean" &&
    isStringArray(r.targets) &&
    (r.supporter === null || isObject(r.supporter)) &&
    Array.isArray(r.contributions) &&
    r.contributions.every(isStoredContribution) &&
    (r.fetchedAt === undefined || r.fetchedAt === null || typeof r.fetchedAt === "string") &&
    (r.unavailable === undefined || isStringArray(r.unavailable))
  );
}

/**
 * Parses a stored document leniently (PROTOCOL §7.0 "Reading never throws"): a document that can't be
 * parsed counts as absent, and so does each malformed part (bad token, cache or nag entry).
 */
export function parseStorageFile(json: unknown): StorageFile {
  if (typeof json !== "string" || !json) return { v: 1 };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { v: 1 };
  }
  if (!isObject(data) || data.v !== 1) return { v: 1 };
  const out: StorageFile = { v: 1 };
  if (isSessionToken(data.sessionToken)) out.sessionToken = data.sessionToken;
  const cache = data.cache;
  if (isObject(cache) && isIsoDate(cache.storedAt) && isStoredResult(cache.result)) {
    out.cache = { result: cache.result, storedAt: cache.storedAt };
  }
  if (isObject(data.nags)) {
    const nags: Record<string, NagState> = {};
    for (const [id, n] of Object.entries(data.nags)) {
      if (isObject(n) && typeof n.runs === "number" && Number.isSafeInteger(n.runs) && n.runs >= 0) {
        nags[id] = { runs: n.runs, lastShown: isIsoDate(n.lastShown) ? n.lastShown : null };
      }
    }
    out.nags = nags;
  }
  return out;
}

/** Serializes a document, omitting absent/null session and cache. */
export function serializeStorageFile(file: StorageFile): string {
  const out: StorageFile = { v: 1 };
  if (file.sessionToken) out.sessionToken = file.sessionToken;
  if (file.cache) out.cache = file.cache;
  if (file.nags && Object.keys(file.nags).length) out.nags = file.nags;
  return JSON.stringify(out);
}

const locks = new WeakMap<object, Map<string, Promise<unknown>>>();

/**
 * Typed access to the document of one target set. Updates are serialized per
 * storage object and key within this process; across processes the storage's
 * atomic write keeps the document valid (last writer wins).
 */
export class Store {
  constructor(
    private readonly storage: SponsorkitStorage,
    private readonly lockKey: object = storage,
  ) {}

  /** Never throws: a failing or malformed read counts as an absent document. */
  async read(hash: string): Promise<StorageFile> {
    try {
      return parseStorageFile(await this.storage.read(hash));
    } catch {
      return { v: 1 };
    }
  }

  /** Read-modify-write. Returns the written document. Skips the write if `fn` returns `null`. */
  update(hash: string, fn: (current: StorageFile) => StorageFile | null): Promise<StorageFile> {
    let perKey = locks.get(this.lockKey);
    if (!perKey) {
      perKey = new Map();
      locks.set(this.lockKey, perKey);
    }
    const prev = perKey.get(hash) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        const current = await this.read(hash);
        const updated = fn(current);
        if (!updated) return current;
        await this.storage.write(hash, serializeStorageFile(updated));
        return updated;
      });
    perKey.set(hash, next);
    void next
      .finally(() => {
        if (perKey?.get(hash) === next) perKey.delete(hash);
      })
      .catch(() => undefined);
    return next;
  }
}
