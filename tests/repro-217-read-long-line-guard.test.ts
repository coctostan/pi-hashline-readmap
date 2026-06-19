import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ensureHashInit, computeLineHash } from "../src/hashline.js";
import init from "../index.js";

function getText(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

function createHarness() {
  const tools: Record<string, any> = {};
  const handlers: Record<string, Function> = {};
  init({
    registerTool(def: any) { tools[def.name] = def; },
    on(event: string, handler: Function) { handlers[event] = handler; },
    events: { emit() {}, on() {} },
  } as any);
  return { tools, handlers };
}

describe("issue 217 — read long-line guard + edit on full content", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("truncates a 20k-char single line in read output with a marker + original length", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-issue-217-"));
    const filePath = resolve(dir, "long.txt");
    const longLine = "needle " + "x".repeat(20000);
    writeFileSync(filePath, longLine, "utf-8");

    const { tools } = createHarness();
    const result = await tools.read.execute("read-1", { path: filePath }, new AbortController().signal, () => {}, { cwd: process.cwd() });
    const text = getText(result);

    const row = text.split("\n").find((l) => /^\d+:[0-9a-f]{3}\|/.test(l)) ?? "";
    const displayed = row.replace(/^\d+:[0-9a-f]{3}\|/, "");
    expect(displayed.length).toBeLessThan(600);
    expect(displayed.endsWith(`... [truncated, ${longLine.length} chars total]`)).toBe(true);
  });

  it("editing the truncated line still applies against full content (hash unchanged)", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-issue-217-edit-"));
    const filePath = resolve(dir, "long.txt");
    const longLine = "needle " + "x".repeat(20000);
    writeFileSync(filePath, longLine, "utf-8");

    const { tools } = createHarness();
    // read first so the read-before-edit guard is satisfied
    await tools.read.execute("read-1", { path: filePath }, new AbortController().signal, () => {}, { cwd: process.cwd() });

    // The anchor hash is derived from the FULL line content (display truncation is cosmetic).
    const anchor = `1:${computeLineHash(1, longLine)}`;
    const editResult = await tools.edit.execute(
      "edit-1",
      { path: filePath, edits: [{ set_line: { anchor, new_text: "replaced();" } }] },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );
    expect(editResult.isError).not.toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe("replaced();");
  });
});
