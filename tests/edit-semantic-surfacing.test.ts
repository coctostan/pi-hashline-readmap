import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash } from "../src/hashline.js";
import { registerEditTool } from "../src/edit.js";
import * as classifyModule from "../src/edit-classify.js";
async function callEditTool(params: Record<string, unknown>) {
  let capturedTool: any = null;
  registerEditTool({ registerTool(def: any) { capturedTool = def; } } as any);
  if (!capturedTool) throw new Error("edit tool was not registered");
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}
function makeFixture(content: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-semantic-surface-"));
  const filePath = resolve(dir, "sample.ts");
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}
function getTextContent(result: any): string {
  return result.content.find((c: any) => c.type === "text")?.text ?? "";
}
describe("edit semantic surfacing", () => {
  beforeAll(async () => {
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("warns when a whitespace-only result came from substantive new_text", async () => {
    const filePath = makeFixture("  const value = 1;\n");
    const anchor = `1:${computeLineHash(1, "  const value = 1;")}`;
    const result = await callEditTool({
      path: filePath,
      edits: [{ set_line: { anchor, new_text: "    const value = 1;" } }],
    });

    const text = getTextContent(result);
    expect(result.isError).not.toBe(true);
    expect(text.split("\n")[0]).toBe(`Edited ${filePath} (1 change, +1 -1 line)`);
    expect(text.split("\n")[1]).toBe(
      "⚠ Edit classified as whitespace-only — if you intended a behavior change, re-read to verify.",
    );
  });
  it("does not warn when every new_text is whitespace-only", async () => {
    const filePath = makeFixture("  \n");
    const anchor = `1:${computeLineHash(1, "  ")}`;
    const result = await callEditTool({
      path: filePath,
      edits: [{ set_line: { anchor, new_text: "    " } }],
    });

    const text = getTextContent(result);
    expect(result.isError).not.toBe(true);
    expect(text).toBe(`Edited ${filePath} (1 change, +1 -1 line)`);
  });
  it("stays quiet for plain semantic edits", async () => {
    const filePath = makeFixture("const a = 1;\n");
    const anchor = `1:${computeLineHash(1, "const a = 1;")}`;
    const result = await callEditTool({
      path: filePath,
      edits: [{ set_line: { anchor, new_text: "const a = 2;" } }],
    });

    const text = getTextContent(result);
    expect(result.isError).not.toBe(true);
    expect(text).toBe(`Edited ${filePath} (1 change, +1 -1 line)`);
    expect(text).not.toContain("[semantic:");
    expect(text).not.toContain("⚠ Edit classified as whitespace-only");
  });
  it("mentions moved blocks inline when semanticSummary reports moves", async () => {
    vi.spyOn(classifyModule, "isDifftAvailable").mockResolvedValue(true);
    vi.spyOn(classifyModule, "runDifftastic").mockResolvedValue({ classification: "mixed", movedBlocks: 2 });
    const filePath = makeFixture("const a = 1;\nconst b = 2;\n");
    const lines = readFileSync(filePath, "utf-8").split("\n");
    const start = `1:${computeLineHash(1, lines[0])}`;
    const end = `2:${computeLineHash(2, lines[1])}`;
    const result = await callEditTool({
      path: filePath,
      edits: [{ replace_lines: { start_anchor: start, end_anchor: end, new_text: "const b = 2;\nconst a = 1;" } }],
    });

    const text = getTextContent(result);
    expect(result.isError).not.toBe(true);
    expect(text).toBe(`Edited ${filePath} (1 change, +1 -1 line) [semantic: mixed, 2 blocks moved]`);
    expect(text).not.toContain("difftastic");
  });
});
