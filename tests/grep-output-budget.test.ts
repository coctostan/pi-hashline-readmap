import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerGrepTool } from "../src/grep.js";

function getText(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

async function callWrapped(params: { pattern: string; path: string; literal?: boolean; limit?: number }) {
  let capturedTool: any = null;
  registerGrepTool({ registerTool(def: any) { capturedTool = def; } } as any);
  if (!capturedTool) throw new Error("grep tool was not registered");
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

describe("grep post-transform budgeting", () => {
  it("adds a truncation notice when rendered hashline output exceeds the final budget", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-grep-budget-"));
    const line = "needle " + "x".repeat(20000);

    for (let i = 0; i < 12; i++) {
      const filePath = join(dir, `file-${String(i + 1).padStart(2, "0")}.txt`);
      writeFileSync(filePath, Array.from({ length: 10 }, () => line).join("\n"), "utf8");
    }

    const result = await callWrapped({
      pattern: "needle",
      path: dir,
      literal: true,
      limit: 200,
    });

    const text = getText(result);
    expect(text).toContain("[Output truncated:");
    // Budget applies to what is persisted and shown to the model. structuredContent is the
    // script-only codemode value (raw lines) and is neither persisted nor sent to the model.
    const { structuredContent, ...persisted } = result;
    expect(Buffer.byteLength(JSON.stringify(persisted))).toBeLessThan(100_000);
    expect(structuredContent.records.every((record: any) => typeof record.raw === "string")).toBe(true);
  });
});
