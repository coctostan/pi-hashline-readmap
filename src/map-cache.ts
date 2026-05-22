import { stat } from "node:fs/promises";
import type { FileMap } from "./readmap/types.js";
import { generateMap, generateMapWithIdentity, ALL_MAPPER_IDENTITIES } from "./readmap/mapper.js";
import { detectLanguage } from "./readmap/language-detect.js";
import {
  computeKey,
  contentHashFor64k,
  readCached,
  writeCached,
  persistenceEnabled,
} from "./persistent-map-cache.js";
interface CacheEntry {
	mtimeMs: number;
	contentHash: string;
	map: FileMap | null;
}
export const MAP_CACHE_MAX_SIZE = 500;
const cache = new Map<string, CacheEntry>();
let maxSize = MAP_CACHE_MAX_SIZE;
function rememberInMemory(absPath: string, entry: CacheEntry): void {
	if (cache.has(absPath)) cache.delete(absPath);
	cache.set(absPath, entry);
	if (cache.size > maxSize) {
		const oldestKey = cache.keys().next().value;
		if (oldestKey !== undefined) cache.delete(oldestKey);
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
	const currentHash = await contentHashFor64k(absPath);
	if (!currentHash || currentHash !== expectedHash) return null;
	return currentHash;
}

/**
 * Get or generate a structural file map, with mtime-based caching.
 * Returns null on any failure — never throws.
 */
export async function getOrGenerateMap(absPath: string): Promise<FileMap | null> {
	try {
		const fileStat = await stat(absPath);
		const { mtimeMs } = fileStat;
		const lang = detectLanguage(absPath);
		const bypassMapCache = lang?.id === "gdscript";
		const cached = cache.get(absPath);
		if (!bypassMapCache && cached && cached.mtimeMs === mtimeMs) {
			const currentHash = await contentHashFor64k(absPath);
			if (currentHash && currentHash === cached.contentHash) {
				cache.delete(absPath);
				cache.set(absPath, cached);
				return cached.map;
			}
		}
		if (!persistenceEnabled() || bypassMapCache) {
			const map = await generateMap(absPath);
			if (!bypassMapCache) {
				const hash = await contentHashFor64k(absPath);
				rememberInMemory(absPath, { mtimeMs, contentHash: hash, map });
			}
			return map;
		}

		let preContentHash = "";
		try {
			preContentHash = await contentHashFor64k(absPath);
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
					if (fromDisk) {
						rememberInMemory(absPath, { mtimeMs, contentHash: preContentHash, map: fromDisk });
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
	maxSize = size;
}

/**
 * Clear the map cache. Exported for testing.
 */
export function clearMapCache(): void {
	cache.clear();
	maxSize = MAP_CACHE_MAX_SIZE;
}