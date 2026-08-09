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

async function executeGrep(params: Record<string, unknown>): Promise<any> {
  return captureGrepTool().execute(
    "repro-246-grep",
    params,
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );
}

function resultText(result: any): string {
  return result.content.find((item: any) => item.type === "text")?.text ?? "";
}

describe("repro 246 - grep validation and summary diagnostics", () => {
  it("does not report source-line display truncation in summary mode", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-grep-summary-truncation-"));
    const filePath = join(dir, "long.txt");
    writeFileSync(filePath, `needle ${"x".repeat(1000)}\n`, "utf8");

    const result = await executeGrep({
      pattern: "needle",
      path: filePath,
      literal: true,
      summary: true,
      limit: 100,
    });
    const text = resultText(result);

    expect(text).toContain(`${filePath}: 1 matches`);
    expect(text).not.toContain("[Some lines truncated to 500 chars. Use read tool to see full lines]");
  });

  it.each([
    {
      params: { context: -1 },
      expectedText: "Invalid context: expected a non-negative integer, received -1.",
      expectedCode: "invalid-params-combo",
    },
    {
      params: { limit: 0 },
      expectedText: "Invalid limit: expected a positive integer, received 0.",
      expectedCode: "invalid-limit",
    },
  ])("rejects invalid numeric search parameter $params", async ({ params, expectedText, expectedCode }) => {
    const dir = mkdtempSync(join(tmpdir(), "pi-grep-invalid-number-"));
    const filePath = join(dir, "matches.txt");
    writeFileSync(filePath, "needle\nneedle\n", "utf8");

    const result = await executeGrep({ pattern: "needle", path: filePath, literal: true, ...params });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(expectedText);
    expect(result.details?.ptcValue?.error?.code).toBe(expectedCode);
  });
});
