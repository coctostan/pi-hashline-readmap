import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerGrepTool } from "../src/grep.js";

function captureGrepTool(): any {
  let tool: any;
  registerGrepTool({ registerTool(def: any) { tool = def; } } as any);
  return tool;
}

function text(result: any): string {
  return result.content.find((item: any) => item.type === "text")?.text ?? "";
}

async function execute(tool: any, filePath: string, params: Record<string, unknown>) {
  return tool.execute(
    "grep-numeric-domain",
    { pattern: "needle", path: filePath, literal: true, ...params },
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );
}

describe("grep numeric domain validation", () => {
  it("rejects negative context and non-positive limit with parity envelopes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-grep-invalid-number-"));
    const filePath = join(dir, "matches.txt");
    writeFileSync(filePath, "needle\nneedle\n", "utf8");
    const tool = captureGrepTool();

    for (const value of [-1, "-1"]) {
      const result = await execute(tool, filePath, { context: value });
      const expected = "Invalid context: expected a non-negative integer, received -1.";
      expect(result.isError).toBe(true);
      expect(text(result)).toBe(expected);
      expect(result.details?.ptcValue).toMatchObject({
        tool: "grep",
        ok: false,
        error: { code: "invalid-params-combo", message: expected },
      });
    }

    for (const value of [0, "0", -1, "-1"]) {
      const result = await execute(tool, filePath, { limit: value });
      const expected = `Invalid limit: expected a positive integer, received ${Number(value)}.`;
      expect(result.isError).toBe(true);
      expect(text(result)).toBe(expected);
      expect(result.details?.ptcValue).toMatchObject({
        tool: "grep",
        ok: false,
        error: { code: "invalid-limit", message: expected },
      });
    }
  });
});
