import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { registerReadTool } from "../src/read.js";

async function callRead(params: Record<string, unknown>): Promise<any> {
  let tool: any;
  registerReadTool({ registerTool(def: any) { tool = def; } } as any);
  return tool.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}
const textOf = (result: any): string => result.content.find((c: any) => c.type === "text")?.text ?? "";
function fixture(content: string | Buffer): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-read-window-warn-"));
  const path = resolve(dir, "f.txt");
  writeFileSync(path, content);
  return path;
}

// Window reads must not look safer than ordinary reads of the same file (code review #269).
describe("read window — file-level warnings", () => {
  it("keeps the binary-content warning in text and ptcValue", async () => {
    const path = fixture(Buffer.from("x".repeat(600) + "\u0000" + "y".repeat(10), "utf8"));
    const result = await callRead({ path, offset: 1, charOffset: 0 });
    expect(result.isError).not.toBe(true);
    expect(textOf(result).startsWith("[Warning: file appears to be binary")).toBe(true);
    expect(result.details.ptcValue.warnings.map((w: any) => w.code)).toEqual(["binary-content"]);
    expect(result.details.ptcValue.window).toBeDefined();
  });

  it("keeps the bare-cr warning in text and ptcValue", async () => {
    const path = fixture("x".repeat(600) + "\r" + "tail");
    const result = await callRead({ path, offset: 1, charOffset: 0 });
    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain("[Warning: file contains bare CR (\\r) line endings");
    expect(result.details.ptcValue.warnings.map((w: any) => w.code)).toEqual(["bare-cr"]);
  });

  it("orders params-adjusted before file warnings, like ordinary reads", async () => {
    const path = fixture(Buffer.from("x".repeat(12_000) + "\u0000", "utf8"));
    const result = await callRead({ path, offset: 1, charLimit: 50_000 });
    expect(result.details.ptcValue.warnings.map((w: any) => w.code)).toEqual(["params-adjusted", "binary-content"]);
  });
});
