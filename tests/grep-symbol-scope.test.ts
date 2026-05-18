import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { computeLineHash, escapeControlCharsForDisplay } from "../src/hashline.js";
import { registerGrepTool } from "../src/grep.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function getGrepTool() {
  let capturedTool: any = null;
  registerGrepTool({ registerTool(def: any) { capturedTool = def; } } as any);
  if (!capturedTool) throw new Error("grep tool was not registered");
  return capturedTool;
}

async function callGrepTool(params: {
  pattern: string;
  path: string;
  literal?: boolean;
  context?: number;
  summary?: boolean;
  scope?: "symbol";
}) {
  const tool = await getGrepTool();
  return tool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getTextContent(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

function writeFixture(name: string, content: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-grep-scope-"));
  const filePath = resolve(dir, name);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("grep scope=symbol integration", () => {
  beforeAll(async () => {
  });

  it("groups multiple matches from the same symbol into one deterministic symbol block", async () => {
    const filePath = writeFixture("scoped.ts", [
      "export function alpha() {",
      "  const scoped = 1;",
      "  console.log(scoped);",
      "  return scoped;",
      "}",
    ].join("\n"));

    const lines = [
      "export function alpha() {",
      "  const scoped = 1;",
      "  console.log(scoped);",
      "  return scoped;",
      "}",
    ];

    const result = await callGrepTool({ pattern: "scoped", path: filePath, literal: true, scope: "symbol" });
    const text = getTextContent(result);
    const ptc = result.details?.ptcValue;
    const displayPath = basename(filePath);

    expect(text).toBe([
      "[3 matches in 1 files]",
      `--- ${displayPath} :: function alpha (1-5, 3 matches) ---`,
      ...lines.map((raw, index) => {
        const lineNumber = index + 1;
        const hash = computeLineHash(lineNumber, raw);
        const marker = lineNumber >= 2 && lineNumber <= 4 ? ">>" : "  ";
        return `${displayPath}:${marker}${lineNumber}:${hash}|${escapeControlCharsForDisplay(raw)}`;
      }),
    ].join("\n"));

    expect(text.match(/:: function alpha/g)).toHaveLength(1);
    expect(ptc.records).toHaveLength(5);
    expect(ptc.scopes).toEqual({
      mode: "symbol",
      groups: [{
        path: filePath,
        displayPath,
        symbol: { name: "alpha", kind: "function", startLine: 1, endLine: 5 },
        matchCount: 3,
        matchLines: [2, 3, 4],
        lineAnchors: lines.map((raw, index) => {
          const lineNumber = index + 1;
          return `${lineNumber}:${computeLineHash(lineNumber, raw)}`;
        }),
      }],
      warnings: [],
    });
  });

  it("falls back to normal grep output with warnings when a match has no enclosing symbol", async () => {
    const filePath = writeFixture("no-symbol.ts", [
      "// lonely marker",
      "export function alpha() {",
      "  return 1;",
      "}",
    ].join("\n"));

    const result = await callGrepTool({ pattern: "lonely", path: filePath, literal: true, context: 1, scope: "symbol" });
    const text = getTextContent(result);
    const ptc = result.details?.ptcValue;

    expect(text).toContain(`[Warning: no enclosing symbol for ${filePath}:1 — showing normal grep lines for this match]`);
    expect(text).toContain("--- no-symbol.ts (1 matches) ---");
    expect(text).not.toContain(":: function");
    expect(ptc.scopes.warnings).toEqual([{ code: "no-enclosing-symbol", message: `[Warning: no enclosing symbol for ${filePath}:1 — showing normal grep lines for this match]`, path: filePath, line: 1 }]);
  });

  it("falls back to normal grep output with warnings when the file is unmappable", async () => {
    const filePath = resolve(fixturesDir, "plain.txt");
    const result = await callGrepTool({ pattern: "plain text", path: filePath, literal: true, scope: "symbol" });
    const text = getTextContent(result);
    const ptc = result.details?.ptcValue;

    expect(text).toContain(`[Warning: symbol scoping unavailable for ${filePath} — showing normal grep lines for this file]`);
    expect(text).toContain("--- plain.txt (1 matches) ---");
    expect(ptc.records.length).toBeGreaterThan(0);
    expect(ptc.scopes.warnings).toEqual([{ code: "unmappable-file", message: `[Warning: symbol scoping unavailable for ${filePath} — showing normal grep lines for this file]`, path: filePath }]);
  });
});
