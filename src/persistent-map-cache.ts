import { createReadStream } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile as fsWriteFile, mkdir as fsMkdir, rename, readdir, stat, unlink } from "node:fs/promises";
import xxhashWasm, { type XXHashAPI } from "xxhash-wasm";
import type { FileMap } from "./readmap/types.js";
import { resolveHashlineJsonSettings } from "./hashline-settings.js";

/**
 * Resolve the on-disk map-cache directory using config precedence:
 * 1. `PI_HASHLINE_MAP_CACHE_DIR` (when non-empty) — used verbatim.
 * 2. JSON `mapCache.dir` (when configured).
 * 3. `$XDG_CACHE_HOME/pi-hashline-readmap/maps` (when non-empty).
 * 4. `~/.cache/pi-hashline-readmap/maps`.
 */
export function resolveCacheDir(): string {
  const explicit = process.env.PI_HASHLINE_MAP_CACHE_DIR;
  if (explicit && explicit.length > 0) return explicit;

  const configured = resolveHashlineJsonSettings().settings.mapCache?.dir;
  if (configured && configured.length > 0) return configured;

  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg && xdg.length > 0) return join(xdg, "pi-hashline-readmap/maps");

  return join(homedir(), ".cache/pi-hashline-readmap/maps");
}

export function persistenceEnabled(): boolean {
  if (process.env.PI_HASHLINE_NO_PERSIST_MAPS === "1") return false;
  const configured = resolveHashlineJsonSettings().settings.mapCache?.enabled;
  if (configured !== undefined) return configured;
  return true;
}

/**
 * Build a deterministic hex cache key from the five input components.
 * Uses SHA-256 truncated to 32 hex chars; collision-safe for our purposes
 * and short enough for readable filenames.
 */
export function computeKey(
  absolutePath: string,
  mtimeMs: number,
  contentHash: string,
  mapperName: string,
  mapperVersion: number,
): string {
  return createHash("sha256")
    .update(`${absolutePath}\0${mtimeMs}\0${contentHash}\0${mapperName}\0${mapperVersion}`)
    .digest("hex")
    .slice(0, 32);
}

const CONTENT_HASH_CHUNK_BYTES = 64 * 1024;

type ContentHashApi = Pick<XXHashAPI, "create32">;
let xxhashReady: Promise<ContentHashApi> | null = null;

function loadXxhash(): Promise<ContentHashApi> {
  if (!xxhashReady) {
    xxhashReady = xxhashWasm().then(({ create32 }) => ({ create32 }));
  }
  return xxhashReady;
}

/**
 * Streaming xxHash32 digest over all bytes in `absPath`. Returns "" when the
 * file cannot be opened or read so callers treat the fingerprint as a miss.
 */
export async function contentHashForFile(absPath: string): Promise<string> {
  try {
    const { create32 } = await loadXxhash();
    const hash = create32(0);
    const stream = createReadStream(absPath, { highWaterMark: CONTENT_HASH_CHUNK_BYTES });
    for await (const chunk of stream) {
      hash.update(chunk as Uint8Array);
    }
    return (hash.digest() >>> 0).toString(16).padStart(8, "0");
  } catch {
    return "";
  }
}

function keyPath(key: string): string {
  return join(resolveCacheDir(), `${key}.json`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFileSymbolLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.name !== "string") return false;
  if (typeof value.kind !== "string") return false;
  if (typeof value.startLine !== "number") return false;
  if (typeof value.endLine !== "number") return false;
  if (value.signature !== undefined && typeof value.signature !== "string") return false;
  if (value.children !== undefined && (!Array.isArray(value.children) || !value.children.every(isFileSymbolLike))) {
    return false;
  }
  if (value.modifiers !== undefined && !isStringArray(value.modifiers)) return false;
  if (value.docstring !== undefined && typeof value.docstring !== "string") return false;
  if (value.isExported !== undefined && typeof value.isExported !== "boolean") return false;
  return true;
}

function isTruncatedInfoLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.totalSymbols === "number"
    && typeof value.shownSymbols === "number"
    && typeof value.omittedSymbols === "number"
  );
}

const DETAIL_LEVELS = new Set(["full", "compact", "minimal", "outline", "truncated"]);

function isFileMap(value: unknown): value is FileMap {
  if (!isRecord(value)) return false;
  if (typeof value.path !== "string") return false;
  if (typeof value.totalLines !== "number") return false;
  if (typeof value.totalBytes !== "number") return false;
  if (typeof value.language !== "string") return false;
  if (!Array.isArray(value.symbols) || !value.symbols.every(isFileSymbolLike)) return false;
  if (!isStringArray(value.imports)) return false;
  if (typeof value.detailLevel !== "string" || !DETAIL_LEVELS.has(value.detailLevel)) return false;
  if (value.truncatedInfo !== undefined && !isTruncatedInfoLike(value.truncatedInfo)) return false;
  return true;
}

/** Read a cached FileMap. Returns null on any failure (missing, corrupt, unreadable). */
export async function readCached(key: string): Promise<FileMap | null> {
  if (!persistenceEnabled()) return null;

  try {
    const raw = await readFile(keyPath(key), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return isFileMap(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function tryWriteCachedRaw(key: string, map: FileMap): Promise<boolean> {
  if (!persistenceEnabled()) return false;
  const dir = resolveCacheDir();
  const target = join(dir, `${key}.json`);
  const tmp = join(dir, `${key}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    await fsMkdir(dir, { recursive: true });
    await fsWriteFile(tmp, JSON.stringify(map));
    await rename(tmp, target);
    return true;
  } catch {
    try {
      await unlink(tmp);
    } catch {
      // ignore temp-file cleanup failures
    }
    return false;
  }
}

/**
 * Low-level atomic write. Internal helper (exported so tests can seed fixtures
 * without going through the eviction counter).
 */
export async function writeCachedRaw(key: string, map: FileMap): Promise<void> {
  await tryWriteCachedRaw(key, map);
}

const DEFAULT_EVICTION_INTERVAL = 20;
const DEFAULT_EVICTION_CAP = 5000;
let writeCounter = 0;
let evictionInterval = DEFAULT_EVICTION_INTERVAL;
let evictionCap = DEFAULT_EVICTION_CAP;

export function __setEvictionHooksForTest(
  hooks: { interval?: number; cap?: number } | null,
): void {
  if (hooks === null) {
    evictionInterval = DEFAULT_EVICTION_INTERVAL;
    evictionCap = DEFAULT_EVICTION_CAP;
    return;
  }

  if (typeof hooks.interval === "number") evictionInterval = hooks.interval;
  if (typeof hooks.cap === "number") evictionCap = hooks.cap;
}

const CACHE_KEY_FILE = /^[0-9a-f]{32}\.json$/;
async function maybeEvict(): Promise<void> {
  try {
    const dir = resolveCacheDir();
    const names = (await readdir(dir)).filter((n) => CACHE_KEY_FILE.test(n));
    if (names.length <= evictionCap) return;

    const entries: Array<{ path: string; age: number }> = [];
    for (const name of names) {
      const path = join(dir, name);
      try {
        const s = await stat(path);
        const age = (s.atimeMs ?? s.mtimeMs) || 0;
        entries.push({ path, age });
      } catch {
        // ignore individual stat failures
      }
    }

    entries.sort((a, b) => a.age - b.age);
    const excess = entries.length - evictionCap;
    for (let i = 0; i < excess; i += 1) {
      try {
        await unlink(entries[i].path);
      } catch {
        // ignore individual unlink failures
      }
    }
  } catch {
    // Swallow eviction errors — never propagate.
  }
}

/**
 * Public atomic write. Counts successful invocations so eviction can trigger lazily.
 */
export async function writeCached(key: string, map: FileMap): Promise<void> {
  if (!(await tryWriteCachedRaw(key, map))) return;
  writeCounter += 1;
  if (writeCounter % evictionInterval === 0) {
    try {
      await maybeEvict();
    } catch {
      // Swallow eviction errors at the call site too.
    }
  }
}

// Test-only: reset the write counter between suites.
export function __resetWriteCounter(): void {
  writeCounter = 0;
}
