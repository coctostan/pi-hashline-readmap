import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { computeLineHash, escapeControlCharsForDisplay } from "../src/hashline.js";
import { clearMapCache } from "../src/map-cache.js";
import * as bundleModule from "../src/read-local-bundle.js";
import { registerReadTool } from "../src/read.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function getReadTool() {
  let capturedTool: any = null;
  registerReadTool({ registerTool(def: any) { capturedTool = def; } } as any);
  if (!capturedTool) throw new Error("read tool was not registered");
  return capturedTool;
}

async function callReadTool(params: { path: string; symbol?: string; bundle?: "local"; map?: boolean; offset?: number; limit?: number; }) {
  const tool = await getReadTool();
  return tool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getTextContent(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

function writeFixture(name: string, content: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-read-bundle-"));
  const filePath = resolve(dir, name);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("read bundle=local integration", () => {
  beforeEach(() => { clearMapCache(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("renders requested symbol plus local support", async () => {
    const sourceLines = [
      "function helperOne() {", "  return 1;", "}", "",
      "function helperTwo(value: number) {", "  return value * 2;", "}", "",
      "export function target() {", "  const value = helperOne();", "  return helperTwo(value);", "}",
    ];
    const filePath = writeFixture("local-bundle.ts", sourceLines.join("\n"));
    const result = await callReadTool({ path: filePath, symbol: "target", bundle: "local" });
    const text = getTextContent(result);
    const ptc = result.details?.ptcValue;

    expect(text).toBe([
      "[Symbol: target (function), lines 9-12 of 12]", "", "## Requested symbol",
      ...sourceLines.slice(8, 12).map((raw, index) => {
        const lineNumber = index + 9;
        return `${lineNumber}:${computeLineHash(lineNumber, raw)}|${escapeControlCharsForDisplay(raw)}`;
      }),
      "", "## Local support",
      ...sourceLines.slice(0, 3).map((raw, index) => {
        const lineNumber = index + 1;
        return `${lineNumber}:${computeLineHash(lineNumber, raw)}|${escapeControlCharsForDisplay(raw)}`;
      }),
      ...sourceLines.slice(4, 7).map((raw, index) => {
        const lineNumber = index + 5;
        return `${lineNumber}:${computeLineHash(lineNumber, raw)}|${escapeControlCharsForDisplay(raw)}`;
      }),
    ].join("\n"));

    expect(ptc.symbol).toEqual({ query: "target", name: "target", kind: "function", parentName: undefined, startLine: 9, endLine: 12 });
    expect(ptc.bundle).toEqual({
      mode: "local",
      applied: true,
      localSupport: [
        {
          name: "helperOne", kind: "function", startLine: 1, endLine: 3,
          lineAnchors: sourceLines.slice(0, 3).map((raw, index) => `${index + 1}:${computeLineHash(index + 1, raw)}`),
        },
        {
          name: "helperTwo", kind: "function", startLine: 5, endLine: 7,
          lineAnchors: sourceLines.slice(4, 7).map((raw, index) => `${index + 5}:${computeLineHash(index + 5, raw)}`),
        },
      ],
      warnings: [],
    });
  });

  it("falls back to plain symbol read when local bundle context cannot be determined", async () => {
    const filePath = resolve(fixturesDir, "small.ts");
    vi.spyOn(bundleModule, "buildLocalBundle").mockReturnValue(null);
    const result = await callReadTool({ path: filePath, symbol: "createDemoDirectory", bundle: "local" });
    const text = getTextContent(result);
    const ptc = result.details?.ptcValue;

    expect(text).toContain("[Warning: local bundle context could not be determined for symbol 'createDemoDirectory' — showing plain symbol read]");
    expect(text).toMatch(/^\[Warning: local bundle context could not be determined for symbol 'createDemoDirectory' — showing plain symbol read\]\n\n\[Symbol: createDemoDirectory \(function\), lines 45-49 of 49\]/);
    expect(text).not.toContain("## Requested symbol");
    expect(ptc.bundle).toEqual({
      mode: "local",
      applied: false,
      localSupport: [],
      warnings: [{ code: "bundle-context-unavailable", message: "[Warning: local bundle context could not be determined for symbol 'createDemoDirectory' — showing plain symbol read]" }],
    });
  });

  it("falls back with warnings when symbol mapping is unavailable", async () => {
    const mapCacheModule = await import("../src/map-cache.js");
    vi.spyOn(mapCacheModule, "getOrGenerateMap").mockResolvedValue(null);

    const filePath = resolve(fixturesDir, "plain.txt");
    const result = await callReadTool({ path: filePath, symbol: "anything", bundle: "local" });
    const text = getTextContent(result);
    const ptc = result.details?.ptcValue;

    expect(text).toContain("[Warning: local bundle unavailable because symbol mapping is not available for .txt files — showing plain symbol read]");
    expect(text).toContain("[Warning: symbol lookup not available for .txt files — showing full file]");
    expect(ptc.bundle).toEqual({
      mode: "local",
      applied: false,
      localSupport: [],
      warnings: [{ code: "bundle-unmappable", message: "[Warning: local bundle unavailable because symbol mapping is not available for .txt files — showing plain symbol read]" }],
    });
  });
});
