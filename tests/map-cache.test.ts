import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, unlink, utimes, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

vi.mock("node:fs/promises", async (importOriginal) => {
	const mod = await importOriginal<typeof import("node:fs/promises")>();
	const mockedStat = vi.fn();
	return {
		...mod,
		stat: async (path: any, options?: any) => {
			const result = await mod.stat(path, options);
			const mocked = mockedStat(path, options);
			if (mocked) return mocked;
			return result;
		},
		__mockedStat: mockedStat,
	};
});
import { getOrGenerateMap, clearMapCache } from "../src/map-cache.js";

function tmpPath(ext = ".ts"): string {
	return join(tmpdir(), `map-cache-test-${randomBytes(8).toString("hex")}${ext}`);
}

describe("map-cache", () => {
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

	function createTempFile(content: string, ext = ".ts"): string {
		const p = tmpPath(ext);
		tempFiles.push(p);
		return p;
	}

	it("first call generates and returns a FileMap", async () => {
		const p = createTempFile("");
		await writeFile(p, 'export function hello(): number {\n  return 1;\n}\n');
		const result = await getOrGenerateMap(p);
		expect(result).not.toBeNull();
		expect(result!.path).toBe(p);
		expect(result!.language).toBeTruthy();
	});

	it("second call with same mtime returns cached result (reference equal)", async () => {
		const p = createTempFile("");
		await writeFile(p, 'export function hello(): number {\n  return 1;\n}\n');
		const first = await getOrGenerateMap(p);
		const second = await getOrGenerateMap(p);
		expect(first).not.toBeNull();
		expect(second).toBe(first); // same reference — came from cache
	});

	it("mtime change invalidates cache and regenerates", async () => {
		const p = createTempFile("");
		await writeFile(p, 'export function hello(): number { return 1; }\n');
		const first = await getOrGenerateMap(p);
		expect(first).not.toBeNull();

		// Change file content and force different mtime
		await writeFile(p, 'export function goodbye(): string { return "bye"; }\n');
		// Ensure mtime is definitely different by setting it to the future
		const future = new Date(Date.now() + 10000);
		await utimes(p, future, future);

		const second = await getOrGenerateMap(p);
		expect(second).not.toBeNull();
		expect(second).not.toBe(first); // different reference — regenerated
	});

	it("returns null when generateMap throws", async () => {
		const mapperModule = await import("../src/readmap/mapper.js");
		const spy = vi.spyOn(mapperModule, "generateMap").mockRejectedValueOnce(new Error("boom"));

		const p = createTempFile("");
		await writeFile(p, 'export function hello() {}\n');
		const result = await getOrGenerateMap(p);
		expect(result).toBeNull();

		spy.mockRestore();
	});

	it("returns null for non-existent file (stat failure)", async () => {
		const result = await getOrGenerateMap("/tmp/does-not-exist-12345.ts");
		expect(result).toBeNull();
	});

	it("clearMapCache empties the cache", async () => {
		const mapperModule = await import("../src/readmap/mapper.js");
		const spy = vi.spyOn(mapperModule, "generateMap");

		const p = createTempFile("");
		await writeFile(p, 'export function hello() {}\n');

		await getOrGenerateMap(p);
		const callsAfterFirst = spy.mock.calls.length;

		clearMapCache();
		await getOrGenerateMap(p);
		expect(spy.mock.calls.length).toBe(callsAfterFirst + 1); // called again after clear

		spy.mockRestore();
	});

	it("regenerates map when content changes but mtime stays the same", async () => {
		const mapperModule = await import("../src/readmap/mapper.js");
		const spy = vi.spyOn(mapperModule, "generateMap");

		const p = createTempFile("");
		await writeFile(p, "export function hello(): number { return 1; }\n");
		const first = await getOrGenerateMap(p);
		expect(first).not.toBeNull();
		expect(first!.symbols.some((s) => s.name === "hello")).toBe(true);

		const s = await stat(p);
		const exactMtimeMs = s.mtimeMs;
		await writeFile(p, "export function goodbye(): string { return 'bye'; }\n");

		// Simulate coarse mtime: force stat to report the old mtime
		const fsPromises = await import("node:fs/promises");
		(fsPromises as any).__mockedStat.mockImplementation(() => {
			return { mtimeMs: exactMtimeMs, mtime: new Date(exactMtimeMs) };
		});

		const second = await getOrGenerateMap(p);

		// Should regenerate because content changed even though mtime matches
		expect(second).not.toBeNull();
		expect(second!.symbols.some((s) => s.name === "goodbye")).toBe(true);
		expect(second).not.toBe(first);

		spy.mockRestore();
	});


	it("does not reuse a stale GDScript map when enablement changes", async () => {
		const mapperModule = await import("../src/readmap/mapper.js");
		const spy = vi.spyOn(mapperModule, "generateMap");
		const originalEnv = process.env.PI_HASHLINE_GDSCRIPT;
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const p = createTempFile("", ".gd");
		await writeFile(p, "func _ready():\n\tpass\n");
		try {
			delete process.env.PI_HASHLINE_GDSCRIPT;
			const first = await getOrGenerateMap(p);
			const callsAfterFirst = spy.mock.calls.length;
			process.env.PI_HASHLINE_GDSCRIPT = "1";
			const second = await getOrGenerateMap(p);

			expect(first).not.toBeNull();
			expect(second).not.toBeNull();
			expect(spy.mock.calls.length).toBe(callsAfterFirst + 1);
			expect(second).not.toBe(first);
		} finally {
			if (originalEnv === undefined) delete process.env.PI_HASHLINE_GDSCRIPT;
			else process.env.PI_HASHLINE_GDSCRIPT = originalEnv;
			error.mockRestore();
			spy.mockRestore();
		}
	});
});
