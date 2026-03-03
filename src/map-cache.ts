import { stat } from "fs/promises";
import type { FileMap } from "./readmap/types.js";
import { generateMap } from "./readmap/mapper.js";

interface CacheEntry {
	mtimeMs: number;
	map: FileMap | null;
}

export const MAP_CACHE_MAX_SIZE = 500;

const cache = new Map<string, CacheEntry>();
let maxSize = MAP_CACHE_MAX_SIZE;

/**
 * Get or generate a structural file map, with mtime-based caching.
 * Returns null on any failure — never throws.
 */
export async function getOrGenerateMap(absPath: string): Promise<FileMap | null> {
	try {
		const fileStat = await stat(absPath);
		const { mtimeMs } = fileStat;

		const cached = cache.get(absPath);
		if (cached && cached.mtimeMs === mtimeMs) {
			// LRU refresh: move hit to the end (most recently used)
			cache.delete(absPath);
			cache.set(absPath, cached);
			return cached.map;
		}

		const map = await generateMap(absPath);
		if (cache.has(absPath)) cache.delete(absPath); // refresh recency for stale regenerated entries
		cache.set(absPath, { mtimeMs, map });
		if (cache.size > maxSize) {
			const oldestKey = cache.keys().next().value;
			if (oldestKey !== undefined) cache.delete(oldestKey);
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
