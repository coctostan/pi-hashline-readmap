import { describe, expect, it, vi } from "vitest";
import * as cp from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

async function captureAstSearchTool(): Promise<any> {
  const { registerSgTool } = await import("../src/sg.js");
  let tool: any;
  registerSgTool({ registerTool(def: any) { tool = def; } } as any);
  return tool;
}

describe("repro 246 — ast_search result limits", () => {
  it("validates the limit domain and enforces an obvious numeric string", async () => {
    const tool = await captureAstSearchTool();
    expect(tool.parameters.properties.limit.anyOf).toBeDefined();
    expect(tool.parameters.required).not.toContain("limit");

    const invalidCases = [
      { value: 0, message: "Invalid limit: expected a positive integer, received 0." },
      { value: "0", message: "Invalid limit: expected a positive integer, received 0." },
      { value: -1, message: "Invalid limit: expected a positive integer, received -1." },
      { value: "-1", message: "Invalid limit: expected a positive integer, received -1." },
      { value: 1.5, message: "Invalid limit: expected a base-10 integer, received 1.5." },
      { value: "1x", message: 'Invalid limit: expected a base-10 integer, received "1x".' },
    ];
    for (const entry of invalidCases) {
      const result = await tool.execute(
        `invalid-ast-limit-${String(entry.value)}`,
        { pattern: "$X", limit: entry.value },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );
      const text = result.content.find((item: any) => item.type === "text")?.text ?? "";
      expect(result.isError).toBe(true);
      expect(text).toBe(entry.message);
      expect(result.details?.ptcValue).toMatchObject({
        tool: "ast_search",
        ok: false,
        error: { code: "invalid-limit", message: entry.message },
      });
    }

    const dir = mkdtempSync(join(tmpdir(), "pi-ast-search-string-limit-"));
    const filePath = join(dir, "many.ts");
    const lines = ["console.log(0);", "console.log(1);", "console.log(2);"];
    writeFileSync(filePath, lines.join("\n"), "utf8");
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
      callback(null, JSON.stringify(lines.map((_line, index) => ({
        file: filePath,
        range: {
          start: { line: index, column: 0 },
          end: { line: index, column: lines[index].length },
        },
      }))), "");
      return {} as any;
    });

    const result = await tool.execute(
      "ast-string-limit",
      { pattern: "console.log($$$ARGS)", path: filePath, limit: "2" },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );
    const text = result.content.find((item: any) => item.type === "text")?.text ?? "";
    expect(result.isError).not.toBe(true);
    expect(result.details.ptcValue.files.flatMap((file: any) => file.lines)).toHaveLength(2);
    expect(text.match(/^>>/gm)).toHaveLength(2);
    expect(text).toContain("[Results truncated: showing 2 of 3 matches (1 omitted). Narrow path/pattern or increase limit.]");
  });

  it("counts raw matches accurately when admitted ranges merge", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-ast-search-overlap-"));
    const filePath = join(dir, "overlap.ts");
    writeFileSync(filePath, "const value = call();\nconst other = call();\n", "utf8");
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
      callback(null, JSON.stringify([
        { file: filePath, range: { start: { line: 0, column: 0 }, end: { line: 0, column: 10 } } },
        { file: filePath, range: { start: { line: 0, column: 6 }, end: { line: 1, column: 8 } } },
        { file: filePath, range: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } } },
      ]), "");
      return {} as any;
    });

    const tool = await captureAstSearchTool();
    const result = await tool.execute(
      "ast-overlap-limit",
      { pattern: "$X", path: filePath, limit: 2 },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );
    const ptc = result.details.ptcValue;
    expect(ptc.files[0].ranges).toEqual([{ startLine: 1, endLine: 2 }]);
    expect(ptc.truncation.matchLimit).toEqual({
      limit: 2,
      totalMatches: 3,
      returnedMatches: 2,
      omittedMatches: 1,
    });
    expect(result.content[0].text).toContain(
      "[Results truncated: showing 2 of 3 matches (1 omitted). Narrow path/pattern or increase limit.]",
    );
  });

  it("defaults to 100 raw matches with accurate omitted metadata", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-ast-search-default-limit-"));
    const filePath = join(dir, "many.ts");
    const lines = Array.from({ length: 110 }, (_, index) => `console.log(${index});`);
    writeFileSync(filePath, lines.join("\n"), "utf8");
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
      callback(null, JSON.stringify(lines.map((_line, index) => ({
        file: filePath,
        range: {
          start: { line: index, column: 0 },
          end: { line: index, column: lines[index].length },
        },
      }))), "");
      return {} as any;
    });

    const tool = await captureAstSearchTool();
    const result = await tool.execute(
      "ast-default-limit",
      { pattern: "console.log($$$ARGS)", path: filePath },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );
    const ptc = result.details.ptcValue;
    expect(ptc.files.flatMap((file: any) => file.lines)).toHaveLength(100);
    expect(ptc.truncation.matchLimit).toEqual({
      limit: 100,
      totalMatches: 110,
      returnedMatches: 100,
      omittedMatches: 10,
    });
    expect(result.content[0].text).toContain(
      "[Results truncated: showing 100 of 110 matches (10 omitted). Narrow path/pattern or increase limit.]",
    );
  });
});
