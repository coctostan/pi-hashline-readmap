import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, unlink, utimes } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import {
	getOrGenerateMap,
	clearMapCache,
	setMapCacheMaxSize,
	MAP_CACHE_MAX_SIZE,
} from "../src/map-cache.js";

function tmpPath(ext = ".ts"): string {
	return join(tmpdir(), `map-cache-lru-test-${randomBytes(8).toString("hex")}${ext}`);
}

describe("map-cache LRU eviction", () => {
	const tempFiles: string[] = [];

	beforeEach(() => {
		clearMapCache();
	});

	afterEach(async () => {
		for (const f of tempFiles) {
			try { await unlink(f); } catch { /* ignore */ }
		}
		tempFiles.length = 0;
	});

	function createTempFile(ext = ".ts"): string {
		const p = tmpPath(ext);
		tempFiles.push(p);
		return p;
	}

	it("evicts oldest entry when cache exceeds max size", async () => {
		setMapCacheMaxSize(3);
		const mapperModule = await import("../src/readmap/mapper.js");
		const spy = vi.spyOn(mapperModule, "generateMap");

		const a = createTempFile();
		const b = createTempFile();
		const c = createTempFile();
		const d = createTempFile();
		await Promise.all([
			writeFile(a, "export const a = 1;\n"),
			writeFile(b, "export const b = 1;\n"),
			writeFile(c, "export const c = 1;\n"),
			writeFile(d, "export const d = 1;\n"),
		]);

		await getOrGenerateMap(a);
		await getOrGenerateMap(b);
		await getOrGenerateMap(c);
		await getOrGenerateMap(d);
		const callsAfterInsert = spy.mock.calls.length;

		await getOrGenerateMap(a);
		expect(spy.mock.calls.length).toBe(callsAfterInsert + 1);

		spy.mockRestore();
	});

	it("refreshes recency on cache hit so recently used entry is not evicted", async () => {
		setMapCacheMaxSize(3);
		const mapperModule = await import("../src/readmap/mapper.js");
		const spy = vi.spyOn(mapperModule, "generateMap");

		const a = createTempFile();
		const b = createTempFile();
		const c = createTempFile();
		const d = createTempFile();
		await Promise.all([
			writeFile(a, "export const a = 1;\n"),
			writeFile(b, "export const b = 1;\n"),
			writeFile(c, "export const c = 1;\n"),
			writeFile(d, "export const d = 1;\n"),
		]);

		await getOrGenerateMap(a);
		await getOrGenerateMap(b);
		await getOrGenerateMap(c);
		await getOrGenerateMap(a); // refresh A
		await getOrGenerateMap(d); // should evict B
		const callsAfterInsert = spy.mock.calls.length;

		await getOrGenerateMap(a); // should still be cached
		expect(spy.mock.calls.length).toBe(callsAfterInsert);

		await getOrGenerateMap(b); // should regenerate because evicted
		expect(spy.mock.calls.length).toBe(callsAfterInsert + 1);

		spy.mockRestore();
	});

	it("treats regenerated stale entries as most-recently-used", async () => {
		setMapCacheMaxSize(2);
		const mapperModule = await import("../src/readmap/mapper.js");
		const spy = vi.spyOn(mapperModule, "generateMap");

		const a = createTempFile();
		const b = createTempFile();
		const c = createTempFile();
		await Promise.all([
			writeFile(a, "export const a = 1;\n"),
			writeFile(b, "export const b = 1;\n"),
			writeFile(c, "export const c = 1;\n"),
		]);

		await getOrGenerateMap(a);
		await getOrGenerateMap(b);

		await writeFile(a, "export const a = 2;\n");
		const future = new Date(Date.now() + 10_000);
		await utimes(a, future, future);
		await getOrGenerateMap(a); // stale regenerate; should become most recent
		await getOrGenerateMap(c); // should evict B
		const callsAfterInsert = spy.mock.calls.length;

		await getOrGenerateMap(a); // should still be cached
		expect(spy.mock.calls.length).toBe(callsAfterInsert);

		await getOrGenerateMap(b); // should regenerate because evicted
		expect(spy.mock.calls.length).toBe(callsAfterInsert + 1);

		spy.mockRestore();
	});

	it("clearMapCache still works and resets max size", async () => {
		setMapCacheMaxSize(1);
		const mapperModule = await import("../src/readmap/mapper.js");
		const spy = vi.spyOn(mapperModule, "generateMap");

		const a = createTempFile();
		const b = createTempFile();
		await Promise.all([
			writeFile(a, "export const a = 1;\n"),
			writeFile(b, "export const b = 1;\n"),
		]);

		await getOrGenerateMap(a);
		clearMapCache();
		await getOrGenerateMap(a);
		await getOrGenerateMap(b);
		const callsAfterAB = spy.mock.calls.length;

		await getOrGenerateMap(a);
		expect(spy.mock.calls.length).toBe(callsAfterAB); // not evicted with default size restored

		spy.mockRestore();
	});

	it("exports default max size of 500", () => {
		expect(MAP_CACHE_MAX_SIZE).toBe(500);
	});
});
