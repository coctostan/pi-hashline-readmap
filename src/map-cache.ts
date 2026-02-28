import { stat } from "fs/promises";
import type { FileMap } from "./readmap/types.js";
import { generateMap } from "./readmap/mapper.js";

interface CacheEntry {
	mtimeMs: number;
	map: FileMap | null;
}

const cache = new Map<string, CacheEntry>();

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
			return cached.map;
		}

		const map = await generateMap(absPath);
		cache.set(absPath, { mtimeMs, map });
		return map;
	} catch {
		return null;
	}
}

/**
 * Clear the map cache. Exported for testing.
 */
export function clearMapCache(): void {
	cache.clear();
}
