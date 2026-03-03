import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { clearMapCache } from "../src/map-cache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

type ReadParams = {
  path: string;
  offset?: number;
  limit?: number;
  symbol?: string;
};


type HashlineRow = {
  line: number;
  hash: string;
  anchor: string;
  content: string;
};

async function getReadTool() {
  const { registerReadTool } = await import("../src/read.js");
  let capturedTool: any = null;
  const mockPi = {
    registerTool(def: any) {
      capturedTool = def;
    },
  };

  registerReadTool(mockPi as any);

  if (!capturedTool) throw new Error("read tool was not registered");
  return capturedTool;
}

async function callReadTool(params: ReadParams) {
  const tool = await getReadTool();
  return tool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getTextContent(result: any): string {
  return result.content.find((c: any) => c.type === "text")?.text ?? "";
}


function parseHashlineRows(text: string): HashlineRow[] {
  const rows: HashlineRow[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^(\d+):([0-9a-f]{2})\|(.*)$/);
    if (!match) continue;
    rows.push({ line: Number(match[1]), hash: match[2], anchor: `${match[1]}:${match[2]}`, content: match[3] });
  }
  return rows;
}

describe("symbol read integration", () => {
  beforeEach(() => clearMapCache());
  afterEach(() => vi.restoreAllMocks());

  it("exposes optional symbol parameter in read tool schema", async () => {
    const tool = await getReadTool();

    expect(tool.parameters.properties.symbol?.type).toBe("string");
    expect(tool.parameters.required ?? []).not.toContain("symbol");
  });

  it("returns error when symbol is combined with offset", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "createDemoDirectory",
      offset: 5,
    });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toBe("Cannot combine symbol with offset/limit. Use one or the other.");
  });

  it("returns error when symbol is combined with limit", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "createDemoDirectory",
      limit: 5,
    });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toBe("Cannot combine symbol with offset/limit. Use one or the other.");
  });


  it("returns only rows from the matched symbol body", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "createDemoDirectory",
    });

    const text = getTextContent(result);
    const rows = parseHashlineRows(text);

    // The fixture function body is 5 lines total.
    expect(rows).toHaveLength(5);
    expect(rows.some((r) => r.content.includes("export function createDemoDirectory"))).toBe(true);
    expect(rows.some((r) => r.content.includes("return directory;"))).toBe(true);
  });

  it("symbol read anchors refer to original file line numbers (edit-compatible)", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "createDemoDirectory",
    });

    const text = getTextContent(result);
    const rows = parseHashlineRows(text);

    // In tests/fixtures/small.ts, createDemoDirectory is on lines 45-49.
    expect(rows).toHaveLength(5);
    expect(rows[0].line).toBe(45);
    expect(rows[rows.length - 1].line).toBe(49);

    // Anchor should apply to the original file (edit-tool compatibility)
    const { applyHashlineEdits } = await import("../src/hashline.js");
    const { readFileSync } = await import("node:fs");
    const filePath = resolve(fixturesDir, "small.ts");
    const original = readFileSync(filePath, "utf-8");
    const edited = applyHashlineEdits(original, [
      { set_line: { anchor: rows[0].anchor, new_text: "// symbol-anchor-edit" } },
    ]);

    expect(edited.firstChangedLine).toBe(45);
    expect(edited.content).toContain("// symbol-anchor-edit");
  });

  it("prepends symbol header with name, kind, and line range", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "createDemoDirectory",
    });

    const text = getTextContent(result);
    expect(text).toMatch(/^\[Symbol: createDemoDirectory \(function\), lines 45-49 of 49\]/);
  });

  it("includes parent breadcrumb when child symbol is queried by name", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "addUser",
    });

    const text = getTextContent(result);
    expect(text).toMatch(/^\[Symbol: addUser \(method\) in UserDirectory, lines 20-33 of 49\]/);

    const rows = parseHashlineRows(text);
    expect(rows).toHaveLength(14);
    expect(rows[0].line).toBe(20);
    expect(rows[rows.length - 1].line).toBe(33);
  });

  it("does not append File Map for found symbol reads even when output is truncated", async () => {
    const cacheModule = await import("../src/map-cache.js");
    const { DetailLevel, SymbolKind } = await import("../src/readmap/enums.js");

    vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
      path: resolve(fixturesDir, "large.ts"),
      totalLines: 10681,
      totalBytes: 500000,
      language: "typescript",
      symbols: [{ name: "HugeBlock", kind: SymbolKind.Function, startLine: 1, endLine: 5000 }],
      imports: [],
      detailLevel: DetailLevel.Full,
    });

    const result = await callReadTool({
      path: resolve(fixturesDir, "large.ts"),
      symbol: "HugeBlock",
    });

    const text = getTextContent(result);
    expect(text).toContain("[Output truncated:");
    expect(text).not.toContain("File Map:");
  });

  it("returns disambiguation text and no hashlines for ambiguous symbol query", async () => {
    const cacheModule = await import("../src/map-cache.js");
    const { DetailLevel, SymbolKind } = await import("../src/readmap/enums.js");

    vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
      path: resolve(fixturesDir, "small.ts"),
      totalLines: 100,
      totalBytes: 1000,
      language: "typescript",
      symbols: [
        { name: "process", kind: SymbolKind.Function, startLine: 1, endLine: 10 },
        { name: "process", kind: SymbolKind.Function, startLine: 20, endLine: 30 },
      ],
      imports: [],
      detailLevel: DetailLevel.Full,
    });

    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "process",
    });

    const text = getTextContent(result);
    expect(text.toLowerCase()).toContain("ambiguous");
    expect(text).toContain("process (function)");
    expect(text).toContain("lines 1-10");
    expect(text).toContain("lines 20-30");
    expect(text).not.toMatch(/^\d+:[0-9a-f]{2}\|/m);
  });

	it("prepends not-found warning and then returns normal hashlines", async () => {
		const result = await callReadTool({
			path: resolve(fixturesDir, "small.ts"),
			symbol: "doesNotExist",
		});

		const text = getTextContent(result);
		expect(text).toContain("[Warning: symbol 'doesNotExist' not found. Available symbols:");
		expect(text).toContain("UserRecord");

		const rows = parseHashlineRows(text);
		expect(rows.length).toBeGreaterThan(0);
	});

	it("limits not-found available-symbol list to 20 entries", async () => {
		const cacheModule = await import("../src/map-cache.js");
		const { DetailLevel, SymbolKind } = await import("../src/readmap/enums.js");

		const manySymbols = Array.from({ length: 25 }, (_, i) => ({
			name: `symbol${String(i + 1).padStart(2, "0")}`,
			kind: SymbolKind.Function,
			startLine: i + 1,
			endLine: i + 1,
		}));

		vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
			path: resolve(fixturesDir, "small.ts"),
			totalLines: 200,
			totalBytes: 2000,
			language: "typescript",
			symbols: manySymbols,
			imports: [],
			detailLevel: DetailLevel.Full,
		});

		const result = await callReadTool({
			path: resolve(fixturesDir, "small.ts"),
			symbol: "missing",
		});

		const text = getTextContent(result);
		const match = text.match(/Available symbols: ([^\]]+)\]/);
		expect(match).not.toBeNull();

		const listed = match![1].split(", ");
		expect(listed.length).toBe(20);
		expect(listed).toContain("symbol01");
		expect(listed).toContain("symbol20");
		expect(listed).not.toContain("symbol21");
	});

	it("falls back with unmappable warning when map is unavailable", async () => {
		const cacheModule = await import("../src/map-cache.js");
		vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue(null);

		const result = await callReadTool({
			path: resolve(fixturesDir, "plain.txt"),
			symbol: "anything",
		});

		const text = getTextContent(result);
		expect(text).toContain("[Warning: symbol lookup not available for .txt files — showing full file]");

		const rows = parseHashlineRows(text);
		expect(rows.length).toBeGreaterThan(0);
	});
});
