import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

async function callReadTool(params: Record<string, unknown>) {
  const { registerReadTool } = await import("../src/read.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerReadTool(mockPi as any);
  if (!captured) throw new Error("read tool not registered");
  return captured.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

describe("read ptcValue.error — invalid-offset", () => {
  it("populates ptcValue.error with code invalid-offset when offset is negative", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-read-err-"));
    const filePath = resolve(dir, "f.txt");
    writeFileSync(filePath, "a\nb\n", "utf-8");
    const result = await callReadTool({ path: filePath, offset: -1 });
    expect(result.isError).toBe(true);
    const text = result.content.find((c: any) => c.type === "text")?.text ?? "";
    expect(text).toContain("Invalid offset");
    const ptc = result.details?.ptcValue;
    expect(ptc).toBeDefined();
    expect(ptc.tool).toBe("read");
    expect(ptc.ok).toBe(false);
    expect(ptc.error).toBeDefined();
    expect(ptc.error.code).toBe("invalid-offset");
    expect(typeof ptc.error.message).toBe("string");
    expect(ptc.error.message.length).toBeGreaterThan(0);
    expect(text.includes(ptc.error.message) || ptc.error.message.includes(text)).toBe(true);
  });
});
