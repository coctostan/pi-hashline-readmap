import { describe, it, expect, beforeEach } from "vitest";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { clearMapCache } from "../src/map-cache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function callReadTool(params: { path: string; offset?: number; limit?: number; symbol?: string; map?: boolean }) {
	const { registerReadTool } = await import("../src/read.js");
	let capturedTool: any = null;
	const mockPi = { registerTool(def: any) { capturedTool = def; } };
	registerReadTool(mockPi as any);
	return capturedTool.execute("test", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

async function getReadToolDef() {
	const { registerReadTool } = await import("../src/read.js");
	let capturedTool: any = null;
	const mockPi = { registerTool(def: any) { capturedTool = def; } };
	registerReadTool(mockPi as any);
	return capturedTool;
}

describe("read map on demand", () => {
	beforeEach(() => clearMapCache());

	it("registers a schema that includes the optional map parameter", async () => {
		const tool = await getReadToolDef();
		expect(tool.parameters?.properties?.map).toBeDefined();
	});

	it("rejects map: true combined with symbol", async () => {
		const result = await callReadTool({
			path: resolve(fixturesDir, "small.ts"),
			map: true,
			symbol: "UserDirectory",
		});
		const text = result.content[0].text;
		expect(result.isError).toBe(true);
		expect(text).toBe("Cannot combine map with symbol. Use one or the other.");
	});

	it("map: true on a small file appends structural map after hashlines", async () => {
		const result = await callReadTool({
			path: resolve(fixturesDir, "small.ts"),
			map: true,
		});
		const text = result.content[0].text;
		// Should have hashlines
		expect(text).toMatch(/^\d+:[0-9a-f]{2}\|/m);
		// Should NOT have truncation message (file is small)
		expect(text).not.toContain("[Output truncated:");
		// Should have structural map appended
		expect(text).toContain("File Map:");
		// Map should contain symbols from small.ts
		expect(text).toContain("UserDirectory");
		expect(text).toContain("UserRecord");
	});

	it("map: true on a truncated file still appends the structural map exactly once", async () => {
		const result = await callReadTool({
			path: resolve(fixturesDir, "large.ts"),
			map: true,
		});
		const text = result.content[0].text;
		// File is large enough to be truncated
		expect(text).toContain("[Output truncated:");
		// Map still appended even when truncated
		expect(text).toContain("File Map:");
		// Map appears exactly once (no double-append)
		expect(text.match(/File Map:/g)?.length).toBe(1);
	});

	it("map: true combined with offset/limit scopes hashlines but still appends full map", async () => {
		const result = await callReadTool({
			path: resolve(fixturesDir, "small.ts"),
			map: true,
			offset: 1,
			limit: 5,
		});
		const text = result.content[0].text;
		// Should have hashlines starting at line 1
		expect(text).toMatch(/^1:[0-9a-f]{2}\|/m);
		// Should have only 5 hashlined content lines (offset=1, limit=5)
		const hashlineRows = text.split("\n").filter((l: string) => /^\d+:[0-9a-f]{2}\|/.test(l));
		expect(hashlineRows.length).toBe(5);
		// Should still have the structural map appended
		expect(text).toContain("File Map:");
		expect(text).toContain("UserDirectory");
	});

	it("map: true on unmappable file returns hashlines without map and no error", async () => {
		const result = await callReadTool({
			path: resolve(fixturesDir, "plain.txt"),
			map: true,
		});
		const text = result.content[0].text;
		// Should have hashlines
		expect(text).toMatch(/^\d+:[0-9a-f]{2}\|/m);
		// Should NOT have a map (plain.txt is unmappable)
		expect(text).not.toContain("File Map:");
		// Should NOT be an error
		expect(result.isError).toBeUndefined();
	});

	it("map not passed: small file does not include structural map", async () => {
		const result = await callReadTool({
			path: resolve(fixturesDir, "small.ts"),
		});
		const text = result.content[0].text;
		// Should have hashlines
		expect(text).toMatch(/^\d+:[0-9a-f]{2}\|/m);
		// Should NOT have structural map (file is small, map not requested)
		expect(text).not.toContain("File Map:");
	});

	it("map: false explicitly: small file does not include structural map", async () => {
		const result = await callReadTool({
			path: resolve(fixturesDir, "small.ts"),
			map: false,
		});
		const text = result.content[0].text;
		expect(text).toMatch(/^\d+:[0-9a-f]{2}\|/m);
		expect(text).not.toContain("File Map:");
	});
});
