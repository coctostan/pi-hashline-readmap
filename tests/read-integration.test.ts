import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { clearMapCache } from "../src/map-cache.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");
type ReadParams = {
	path: string;
	offset?: number;
	limit?: number;
};

type HashlineRow = {
	line: number;
	hash: string;
	anchor: string;
	content: string;
};

async function callReadTool(params: ReadParams) {
	const { registerReadTool } = await import("../src/read.js");
	let capturedTool: any = null;
	const mockPi = {
		registerTool(def: any) {
			capturedTool = def;
		},
	};
	registerReadTool(mockPi as any);
	if (!capturedTool) throw new Error("read tool was not registered");
	return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}
function getTextContent(result: any): string {
	return result.content.find((c: any) => c.type === "text")?.text ?? "";
}

function parseHashlineRows(text: string): HashlineRow[] {
	const rows: HashlineRow[] = [];
	for (const line of text.split("\n")) {
		const match = line.match(/^(\d+):([0-9a-f]{2})\|(.*)$/);
		if (!match) continue;
		rows.push({
			line: Number(match[1]),
			hash: match[2],
			anchor: `${match[1]}:${match[2]}`,
			content: match[3],
		});
	}
	return rows;
}

describe("read integration — combined output", () => {
	beforeEach(() => clearMapCache());
	afterEach(() => vi.restoreAllMocks());

	it("small TypeScript file returns hashlines only (no map)", async () => {
		const result = await callReadTool({ path: resolve(fixturesDir, "small.ts") });
		const text = getTextContent(result);

		expect(text).toMatch(/^\d+:[0-9a-f]{2}\|/m);
		expect(text).not.toContain("File Map:");
		expect(text).not.toContain("[Output truncated:");
	});

	it("large TypeScript file returns hashlines and appended map", async () => {
		const result = await callReadTool({ path: resolve(fixturesDir, "large.ts") });
		const text = getTextContent(result);

		expect(text).toMatch(/^\d+:[0-9a-f]{2}\|/m);
		expect(text).toContain("[Output truncated:");
		expect(text).toContain("File Map:");
		expect(text).toContain("EventEmitter");
		expect(text).toContain("parseConfig");
		expect(text).toContain("DatabaseConnection");
		expect(text).toContain("TaskRunner");
		expect(text).toContain("DataProcessor");
		expect(text).toContain("initialize");
	});

	it("large TypeScript file with offset returns hashlines only (no map)", async () => {
		const result = await callReadTool({
			path: resolve(fixturesDir, "large.ts"),
			offset: 100,
		});
		const text = getTextContent(result);

		expect(text).toMatch(/^\d+:[0-9a-f]{2}\|/m);
		expect(text).not.toContain("File Map:");
	});

	it("large TypeScript file with limit returns hashlines only (no map)", async () => {
		const result = await callReadTool({
			path: resolve(fixturesDir, "large.ts"),
			limit: 100,
		});
		const text = getTextContent(result);

		expect(text).toMatch(/^\d+:[0-9a-f]{2}\|/m);
		expect(text).not.toContain("File Map:");
	});

	it("small Python file returns hashlines only", async () => {
		const result = await callReadTool({ path: resolve(fixturesDir, "small.py") });
		const text = getTextContent(result);

		expect(text).toMatch(/^\d+:[0-9a-f]{2}\|/m);
		expect(text).not.toContain("File Map:");
		expect(text).not.toContain("[Output truncated:");
	});

	it("plain text file returns hashlines only", async () => {
		const result = await callReadTool({ path: resolve(fixturesDir, "plain.txt") });
		const text = getTextContent(result);

		expect(text).toMatch(/^\d+:[0-9a-f]{2}\|/m);
		expect(text).not.toContain("File Map:");
		expect(text).not.toContain("[Output truncated:");
	});

	it("map generation failure still returns hashlines without error", async () => {
		const cacheModule = await import("../src/map-cache.js");
		vi.spyOn(cacheModule, "getOrGenerateMap").mockImplementation(async () => {
			throw new Error("map failure");
		});

		const result = await callReadTool({ path: resolve(fixturesDir, "large.ts") });
		const text = getTextContent(result);

		expect(result.isError).not.toBe(true);
		expect(text).toMatch(/^\d+:[0-9a-f]{2}\|/m);
		expect(text).not.toContain("File Map:");
	});
});
describe("read integration — hashline format", () => {
	beforeEach(() => clearMapCache());

	it("hashlines match LINE:HASH| format and are sequential from line 1", async () => {
		const result = await callReadTool({ path: resolve(fixturesDir, "small.ts") });
		const text = getTextContent(result);
		const rows = parseHashlineRows(text);

		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(`${row.line}:${row.hash}|${row.content}`).toMatch(/^\d+:[0-9a-f]{2}\|/);
		}
		for (let i = 0; i < rows.length; i++) {
			expect(rows[i].line).toBe(i + 1);
		}
	});

	it("offset reads use sequential line numbers from the requested offset", async () => {
		const offset = 7;
		const limit = 6;
		const result = await callReadTool({ path: resolve(fixturesDir, "small.ts"), offset, limit });
		const rows = parseHashlineRows(getTextContent(result));

		expect(rows.length).toBe(limit);
		for (let i = 0; i < rows.length; i++) {
			expect(rows[i].line).toBe(offset + i);
		}
	});

	it("hash output is deterministic for identical file content", async () => {
		const first = await callReadTool({ path: resolve(fixturesDir, "small.ts") });
		const second = await callReadTool({ path: resolve(fixturesDir, "small.ts") });
		expect(getTextContent(first)).toBe(getTextContent(second));
	});

	it("parsed rows expose reusable LINE:HASH anchors", () => {
		const [row] = parseHashlineRows("12:ab|hello world");
		expect((row as any).anchor).toBe("12:ab");
	});
});
describe("read integration — edit after read", () => {
	beforeEach(() => clearMapCache());

	it("anchors from large.ts read output are accepted by applyHashlineEdits", async () => {
		const { applyHashlineEdits } = await import("../src/hashline.js");
		const largeFixturePath = resolve(fixturesDir, "large.ts");
		const readResult = await callReadTool({ path: largeFixturePath });
		const rows = parseHashlineRows(getTextContent(readResult));
		const anchorRow = rows[0];

		expect(anchorRow).toBeDefined();
		const anchor = anchorRow.anchor;
		const originalContent = readFileSync(largeFixturePath, "utf-8");

		let editResult:
			| {
					content: string;
					firstChangedLine: number | undefined;
			  }
			| undefined;

		expect(() => {
			editResult = applyHashlineEdits(originalContent, [
				{ set_line: { anchor, new_text: "// edited by integration test" } },
			]);
		}).not.toThrow();

		expect(editResult?.content).toContain("// edited by integration test");
		expect(editResult?.firstChangedLine).toBe(anchorRow.line);
	});
});