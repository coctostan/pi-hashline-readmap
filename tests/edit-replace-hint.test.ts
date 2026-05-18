import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash } from "../src/hashline.js";
import { registerEditTool } from "../src/edit.js";

const INFO_HINT = "[info: this edit used replace (unverified). For safer future edits, prefer set_line/replace_lines with an anchor from read/grep/ast_search.]";

async function callEditTool(params: Record<string, unknown>) {
  let capturedTool: any = null;
  registerEditTool({ registerTool(def: any) { capturedTool = def; } } as any);
  if (!capturedTool) throw new Error("edit tool was not registered");
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function makeFixture(content: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-replace-hint-"));
  const filePath = resolve(dir, "sample.ts");
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

function getTextContent(result: any): string {
  return result.content.find((c: any) => c.type === "text")?.text ?? "";
}

describe("edit replace hint", () => {
  beforeAll(async () => {
  });

  it("adds the info line for successful replace-only batches", async () => {
    const filePath = makeFixture("const value = 1;\n");
    const result = await callEditTool({
      path: filePath,
      edits: [{ replace: { old_text: "const value = 1;", new_text: "const value = 2;" } }],
    });

    const text = getTextContent(result);
    expect(result.isError).not.toBe(true);
    expect(text).toContain(INFO_HINT);
    expect(text.split("\n").at(-1)).toBe(INFO_HINT);
  });

  it("omits the info line for anchored-only batches", async () => {
    const filePath = makeFixture("const value = 1;\n");
    const anchor = `1:${computeLineHash(1, "const value = 1;")}`;

    const result = await callEditTool({
      path: filePath,
      edits: [{ set_line: { anchor, new_text: "const value = 2;" } }],
    });

    expect(getTextContent(result)).not.toContain(INFO_HINT);
  });

  it("omits the info line for mixed anchored-plus-replace batches", async () => {
    const filePath = makeFixture("const one = 1;\nconst two = 2;\n");
    const anchor = `1:${computeLineHash(1, "const one = 1;")}`;

    const result = await callEditTool({
      path: filePath,
      edits: [
        { set_line: { anchor, new_text: "const one = 11;" } },
        { replace: { old_text: "const two = 2;", new_text: "const two = 22;" } },
      ],
    });

    expect(getTextContent(result)).not.toContain(INFO_HINT);
  });

  it("puts the info line after warnings for legacy replace-only success", async () => {
    const filePath = makeFixture("const two = 2;\n");
    const result = await callEditTool({
      path: filePath,
      oldText: "const two = 2;",
      newText: "const two = 22;",
    });

    const text = getTextContent(result);
    expect(result.isError).not.toBe(true);
    expect(text).toContain("Warnings:");
    expect(text).toContain(INFO_HINT);
    expect(text.indexOf("Warnings:")).toBeLessThan(text.indexOf(INFO_HINT));
    expect(text.split("\n").at(-1)).toBe(INFO_HINT);
  });

  it("suppresses the info line for replace no-op results", async () => {
    const filePath = makeFixture("const value = 1;\n");
  const result = await callEditTool({
    path: filePath,
    edits: [{ replace: { old_text: "const value = 1;", new_text: "const value = 1;" } }],
  });

  expect(result.isError).toBe(true);
  const text = getTextContent(result);
  expect(text).toContain("No changes made to");
  expect(text).not.toContain(INFO_HINT);
});
});