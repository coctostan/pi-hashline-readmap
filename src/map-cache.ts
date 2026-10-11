import { stat, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import type { FileMap } from "./readmap/types.js";
import { generateMap, generateMapWithIdentity, ALL_MAPPER_IDENTITIES } from "./readmap/mapper.js";
import { detectLanguage } from "./readmap/language-detect.js";
import {
  computeKey,
  contentHashForFile,
  readCached,
  writeCached,
  persistenceEnabled,
} from "./persistent-map-cache.js";
interface CacheEntry {
	mtimeMs: number;
	contentHash: string;
	map: FileMap | null;
}

function isUsefulMap(map: FileMap): boolean {
	return map.symbols.length > 0;
}
export const MAP_CACHE_MAX_SIZE = 500;

interface MapCacheGlobalState {
	cache: Map<string, CacheEntry>;
	maxSize: number;
}

const MAP_CACHE_STATE_KEY = Symbol.for("pi-hashline-readmap.mapCacheState.v1");

function getMapCacheState(): MapCacheGlobalState {
	const globalObject = globalThis as any;
	globalObject[MAP_CACHE_STATE_KEY] ??= {
		cache: new Map<string, CacheEntry>(),
		maxSize: MAP_CACHE_MAX_SIZE,
	} satisfies MapCacheGlobalState;
	return globalObject[MAP_CACHE_STATE_KEY] as MapCacheGlobalState;
}

function rememberInMemory(absPath: string, entry: CacheEntry): void {
	const state = getMapCacheState();
	if (state.cache.has(absPath)) state.cache.delete(absPath);
	state.cache.set(absPath, entry);
	if (state.cache.size > state.maxSize) {
		const oldestKey = state.cache.keys().next().value;
		if (oldestKey !== undefined) state.cache.delete(oldestKey);
	}
}

async function stableContentHash(
	absPath: string,
	mtimeMs: number,
	expectedHash: string,
): Promise<string | null> {
	if (!expectedHash) return null;
	const currentStat = await stat(absPath);
	if (currentStat.mtimeMs !== mtimeMs) return null;
	const currentHash = await contentHashForFile(absPath);
	if (!currentHash || currentHash !== expectedHash) return null;
	return currentHash;
}

async function generateSnapshotMap(
  absPath: string,
  snapshot: Buffer,
): Promise<import("./readmap/mapper.js").MapResultWithIdentity> {
  const directory = await mkdtemp(join(tmpdir(), "pi-readmap-snapshot-"));
  try {
    const stagedPath = join(directory, basename(absPath));
    await writeFile(stagedPath, snapshot, { mode: 0o600, flag: "wx" });
    const result = await generateMapWithIdentity(stagedPath);
    return {
      ...result,
      map: result.map ? { ...result.map, path: absPath } : null,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function getCachedSnapshotMap(absPath: string, snapshot: Buffer): Promise<FileMap | null> {
  const lang = detectLanguage(absPath);
  if (lang?.id === "gdscript") return (await generateSnapshotMap(absPath, snapshot)).map;

  const candidates = [
    ...(lang && ALL_MAPPER_IDENTITIES[lang.id] ? [ALL_MAPPER_IDENTITIES[lang.id]] : []),
    ALL_MAPPER_IDENTITIES.ctags,
    ALL_MAPPER_IDENTITIES.fallback,
  ].filter((identity): identity is import("./readmap/mapper.js").MapperIdentity => Boolean(identity));
  const digest = "snapshot-v1:" + createHash("sha256").update(snapshot).digest("hex");
  const memoryHash = digest + ":" + JSON.stringify(candidates);
  const memoryKey = "snapshot-v1:" + absPath;
  const state = getMapCacheState();
  const cached = state.cache.get(memoryKey);
  if (cached?.contentHash === memoryHash && (cached.map === null || isUsefulMap(cached.map))) {
    rememberInMemory(memoryKey, cached);
    return cached.map;
  }
  if (persistenceEnabled()) {
    for (const identity of candidates) {
      try {
        const key = computeKey(absPath, 0, digest, identity.mapperName, identity.mapperVersion);
        const map = await readCached(key);
        if (map && map.path === absPath && map.totalBytes === snapshot.length && isUsefulMap(map)) {
          rememberInMemory(memoryKey, { mtimeMs: 0, contentHash: memoryHash, map });
          return map;
        }
      } catch {
        // A cache miss must not prevent mapping the captured bytes.
      }
    }
  }
  const result = await generateSnapshotMap(absPath, snapshot);
  const map = result.map;
  if (map === null || isUsefulMap(map)) {
    rememberInMemory(memoryKey, { mtimeMs: 0, contentHash: memoryHash, map });
  }
  if (map && isUsefulMap(map) && persistenceEnabled()) {
    const identity = ALL_MAPPER_IDENTITIES[result.mapperName] ?? result;
    try {
      await writeCached(computeKey(absPath, 0, digest, identity.mapperName, identity.mapperVersion), map);
    } catch {
      // Returning a coherent snapshot does not depend on persistence.
    }
  }
  return map;
}

/**
 * Without snapshot: get or generate a path map with existing mtime/hash caching;
 * return null on failure.
 * With snapshot: map a private copy of these exact bytes, preserving absPath as
 * identity. Infrastructure failures reject; a normal unmappable source is null.
 */
export async function getOrGenerateMap(absPath: string, snapshot?: Buffer): Promise<FileMap | null> {
  if (snapshot !== undefined) {
    return getCachedSnapshotMap(absPath, Buffer.from(snapshot));
  }
	try {
		const fileStat = await stat(absPath);
		const { mtimeMs } = fileStat;
		const lang = detectLanguage(absPath);
		const bypassMapCache = lang?.id === "gdscript";
		const state = getMapCacheState();
		const cached = state.cache.get(absPath);
		if (!bypassMapCache && cached && cached.mtimeMs === mtimeMs) {
			const currentHash = await contentHashForFile(absPath);
			if (currentHash && currentHash === cached.contentHash) {
				state.cache.delete(absPath);
				if (cached.map === null || isUsefulMap(cached.map)) {
					state.cache.set(absPath, cached);
					return cached.map;
				}
			}
		}
		if (!persistenceEnabled() || bypassMapCache) {
			const map = await generateMap(absPath);
			if (!bypassMapCache) {
				const hash = await contentHashForFile(absPath);
				rememberInMemory(absPath, { mtimeMs, contentHash: hash, map });
			}
			return map;
		}

		let preContentHash = "";
		try {
			preContentHash = await contentHashForFile(absPath);
			if (preContentHash) {
				const langIdentity = lang ? ALL_MAPPER_IDENTITIES[lang.id] : undefined;
				const candidates = [
					...(langIdentity ? [langIdentity] : []),
					ALL_MAPPER_IDENTITIES.ctags,
					ALL_MAPPER_IDENTITIES.fallback,
				];
				for (const candidate of candidates) {
					if (!candidate) continue;
					const key = computeKey(
						absPath,
						mtimeMs,
						preContentHash,
						candidate.mapperName,
						candidate.mapperVersion,
					);
					const fromDisk = await readCached(key);
					if (fromDisk && isUsefulMap(fromDisk)) {
						rememberInMemory(absPath, {
							mtimeMs,
							contentHash: preContentHash,
							map: fromDisk,
						});
						return fromDisk;
				}
			}
			}
		} catch {
			// fall through to regeneration on a disk-cache miss
		}
		const { map, mapperName, mapperVersion } = await generateMapWithIdentity(absPath);
		const persistentIdentity = ALL_MAPPER_IDENTITIES[mapperName] ?? { mapperName, mapperVersion };
		let stableHash: string | null = null;
		let shouldRemember = true;
		if (preContentHash) {
			try {
				stableHash = await stableContentHash(absPath, mtimeMs, preContentHash);
				shouldRemember = stableHash !== null;
			} catch {
				shouldRemember = false;
			}
		}
		if (shouldRemember) {
			const hash = stableHash ?? preContentHash ?? "";
			rememberInMemory(absPath, { mtimeMs, contentHash: hash, map });
		}
		if (map && stableHash) {
			try {
				const key = computeKey(
					absPath,
					mtimeMs,
					stableHash,
					persistentIdentity.mapperName,
					persistentIdentity.mapperVersion,
				);
				await writeCached(key, map);
			} catch {
				// never fail the caller on a cache-write miss
			}
		}
		return map;
	} catch {
		return null;
	}
}
export function setMapCacheMaxSize(size: number): void {
	getMapCacheState().maxSize = size;
}

/**
 * Clear the map cache. Exported for testing.
 */
export function clearMapCache(): void {
	const state = getMapCacheState();
	state.cache.clear();
	state.maxSize = MAP_CACHE_MAX_SIZE;
}

export function __getInMemoryMapCacheSizeForTest(): number {
	return getMapCacheState().cache.size;
}