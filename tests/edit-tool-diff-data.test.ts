import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";
import { registerEditTool } from "../src/edit.js";

async function callEditTool(params: Record<string, unknown>) {
  let capturedTool: any;
  registerEditTool({ registerTool(tool: any) { capturedTool = tool; } } as any);
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

describe("edit tool diffData", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("returns diffData in details and ptcValue for compact anchor edits without changing legacy fields", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-diff-data-"));
    const filePath = resolve(dir, "sample.ts");
    writeFileSync(filePath, "const value = 1;\nconst other = 2;", "utf-8");
    const oldLine = readFileSync(filePath, "utf-8").split("\n")[0];
    const anchor = `1:${computeLineHash(1, oldLine)}`;

    const result = await callEditTool({
      path: filePath,
      edits: [{ set_line: { anchor, new_text: "const value = 11;" } }],
    });

    expect(result.details.diff).toMatch(/^1:[0-9a-f]{3}\|const value = 1; → 1:[0-9a-f]{3}\|const value = 11;$/);
    expect(result.details.patch).toMatch(/^Index: .*sample\.ts$/m);
    expect(result.details.patch).toMatch(/^--- .*sample\.ts$/m);
    expect(result.details.patch).toMatch(/^\+\+\+ .*sample\.ts$/m);
    expect(result.details.patch).toContain("@@ -1,2 +1,2 @@");
    expect(result.details.patch).toContain("-const value = 1;");
    expect(result.details.patch).toContain("+const value = 11;");
    expect(result.details.diff).toMatch(/^1:[0-9a-f]{3}\|const value = 1; → 1:[0-9a-f]{3}\|const value = 11;$/);
    expect(result.details.firstChangedLine).toBe(1);
    expect(result.details.ptcValue.diff).toBe(result.details.diff);
    expect(result.content[0].text).toContain("Edited");
    expect(result.details.diffData).toEqual(result.details.ptcValue.diffData);
    expect(result.details.diffData.version).toBe(1);
    expect(result.details.diffData.entries).toEqual([
      { kind: "remove", oldLine: 1, text: "const value = 1;" },
      { kind: "add", newLine: 1, text: "const value = 11;" },
    ]);
    expect(result.details.diffData.inlineDiffs?.length).toBeGreaterThan(0);
  });


  it("returns expanded diffData entries for compact deletion edits", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-delete-diff-data-"));
    const filePath = resolve(dir, "sample.ts");
    writeFileSync(filePath, "line one\nline two\nline three", "utf-8");
    const anchor = `2:${computeLineHash(2, "line two")}`;

    const result = await callEditTool({
      path: filePath,
      edits: [{ replace_lines: { start_anchor: anchor, end_anchor: anchor, new_text: "" } }],
    });

    expect(result.details.diff).toMatch(/^2:[0-9a-f]{3}\|line two → \[deleted\]$/);
    expect(result.details.diffData.entries).toEqual([{ kind: "remove", oldLine: 2, text: "line two" }]);
  });

  it("returns 1:1 diffData entries for full multi-line edit diffs", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-full-diff-data-"));
    const filePath = resolve(dir, "sample.ts");
    writeFileSync(filePath, "const one = 1;\nconst two = 2;\nconst three = 3;\nconst four = 4;", "utf-8");
    const startAnchor = `2:${computeLineHash(2, "const two = 2;")}`;
    const endAnchor = `3:${computeLineHash(3, "const three = 3;")}`;

    const result = await callEditTool({
      path: filePath,
      edits: [{ replace_lines: { start_anchor: startAnchor, end_anchor: endAnchor, new_text: "const two = 22;\nconst three = 33;" } }],
    });

    expect(result.details.diff).toContain("-2 const two = 2;");
    expect(result.details.diff).toContain("+2 const two = 22;");
    expect(result.details.diffData.entries).toHaveLength(result.details.diff.split("\n").length);
    expect(result.details.diffData.entries.some((entry: any) => entry.kind === "context")).toBe(true);
  });

  it("returns replace_symbol blockRanges from resolved symbol ranges", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-symbol-diff-data-"));
    const filePath = resolve(dir, "sample.ts");
    writeFileSync(filePath, [
      "export function greet(firstName: string) {",
      "  return firstName;",
      "}",
    ].join("\n"), "utf-8");

    const result = await callEditTool({
      path: filePath,
      edits: [{ replace_symbol: { symbol: "greet", new_body: ["export function greet(displayName: string) {", "  return displayName;", "}"].join("\n") } }],
    });

    expect(result.details.diffData.blockRanges).toEqual([{ kind: "remove", startLine: 1, endLine: 3 }]);
  });
});
