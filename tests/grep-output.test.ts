import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { computeLineHash, escapeControlCharsForDisplay } from "../src/hashline.js";
import * as grepModule from "../src/grep.js";
import * as grepOutputModule from "../src/grep-output.js";
import { buildGrepOutput } from "../src/grep-output.js";
import { buildPtcLine } from "../src/ptc-value.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function callGrepTool(params: { pattern: string; path: string; literal?: boolean; context?: number; summary?: boolean; limit?: number }) {
  let capturedTool: any = null;
  const mockPi = { registerTool(def: any) { capturedTool = def; } };
  grepModule.registerGrepTool(mockPi as any);
  if (!capturedTool) throw new Error("grep tool was not registered");
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getTextContent(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

function makeManyMatchesFile(): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-grep-output-"));
  const filePath = resolve(dir, "many-matches.txt");
  writeFileSync(filePath, Array.from({ length: 60 }, (_, index) => `match line ${index + 1}`).join("\n"), "utf-8");
  return filePath;
}

describe("buildGrepOutput", () => {
  beforeAll(async () => {
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders grouped grep matches through one shared builder", async () => {
    const spy = vi.spyOn(grepOutputModule, "buildGrepOutput");
    const filePath = resolve(fixturesDir, "small.ts");
    const displayPath = basename(filePath);
    const sourceLines = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n").split("\n");
    const result = await callGrepTool({ pattern: "createDemoDirectory", path: filePath, literal: true, context: 1 });

    const built = spy.mock.results.at(-1)?.value;
    const expectedText = [
      "[1 matches in 1 files]",
      `--- ${displayPath} (1 matches) ---`,
      ...[
        { lineNumber: 44, marker: "  " },
        { lineNumber: 45, marker: ">>" },
        { lineNumber: 46, marker: "  " },
      ].map(({ lineNumber, marker }) => {
        const raw = sourceLines[lineNumber - 1];
        const hash = computeLineHash(lineNumber, raw);
        return `${displayPath}:${marker}${lineNumber}:${hash}|${escapeControlCharsForDisplay(raw)}`;
      }),
    ].join("\n");

    expect(built.text).toBe(expectedText);
    expect(getTextContent(result)).toBe(built.text);
    expect(result.details?.ptcValue).toEqual(built.ptcValue);
  });

  it("renders grep summary mode through the same shared builder", async () => {
    const spy = vi.spyOn(grepOutputModule, "buildGrepOutput");
    const filePath = makeManyMatchesFile();
    const result = await callGrepTool({
      pattern: "match",
      path: filePath,
      literal: true,
      summary: true,
      limit: 60,
    });

    const built = spy.mock.results.at(-1)?.value;
    expect(built.text.includes(">>")).toBe(false);
    expect(built.text).toContain(`${filePath}: 60 matches`);
    expect(getTextContent(result)).toBe(built.text);
    expect(result.details?.ptcValue).toEqual(built.ptcValue);
  });

  it("appends 'scoped to ±N lines' to the symbol header when scope.contextLines is set", async () => {
    const line3 = buildPtcLine(3, "  const x = 1;");
    const out = buildGrepOutput({
      summary: false,
      totalMatches: 1,
      groups: [
        {
          displayPath: "foo.ts",
          absolutePath: "/tmp/foo.ts",
          matchCount: 1,
          entries: [{ kind: "match", line: line3 }],
          scope: {
            mode: "symbol",
            symbol: { name: "alpha", kind: "function", startLine: 1, endLine: 10 },
            matchLines: [3],
            contextLines: 3,
          },
        },
      ],
      records: [{ path: "/tmp/foo.ts", kind: "match", ...line3 }],
      scopeMode: "symbol",
    });
    expect(out.text).toContain("--- foo.ts :: function alpha (1-10, 1 matches, scoped to ±3 lines) ---");
  });

  it("renders '±0' when scope.contextLines is 0", async () => {
    const line3 = buildPtcLine(3, "  const x = 1;");
    const out = buildGrepOutput({
      summary: false,
      totalMatches: 1,
      groups: [
        {
          displayPath: "foo.ts",
          absolutePath: "/tmp/foo.ts",
          matchCount: 1,
          entries: [{ kind: "match", line: line3 }],
          scope: {
            mode: "symbol",
            symbol: { name: "alpha", kind: "function", startLine: 1, endLine: 10 },
            matchLines: [3],
            contextLines: 0,
          },
        },
      ],
      records: [{ path: "/tmp/foo.ts", kind: "match", ...line3 }],
      scopeMode: "symbol",
    });
    expect(out.text).toContain("scoped to ±0 lines");
  });

  it("omits the '±N lines' suffix when scope.contextLines is unset", async () => {
    const line3 = buildPtcLine(3, "  const x = 1;");
    const out = buildGrepOutput({
      summary: false,
      totalMatches: 1,
      groups: [
        {
          displayPath: "foo.ts",
          absolutePath: "/tmp/foo.ts",
          matchCount: 1,
          entries: [{ kind: "match", line: line3 }],
          scope: {
            mode: "symbol",
            symbol: { name: "alpha", kind: "function", startLine: 1, endLine: 10 },
            matchLines: [3],
          },
        },
      ],
      records: [{ path: "/tmp/foo.ts", kind: "match", ...line3 }],
      scopeMode: "symbol",
    });
    expect(out.text).toContain("--- foo.ts :: function alpha (1-10, 1 matches) ---");
    expect(out.text).not.toContain("scoped to");
  });
});
