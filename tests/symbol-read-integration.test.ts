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
});
