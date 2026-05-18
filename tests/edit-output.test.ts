import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash } from "../src/hashline.js";
import * as editModule from "../src/edit.js";
import * as editOutputModule from "../src/edit-output.js";
import { buildEditOutput } from "../src/edit-output.js";
async function callEditTool(params: Record<string, unknown>) {
  let capturedTool: any = null;
  const mockPi = { registerTool(def: any) { capturedTool = def; } };
  editModule.registerEditTool(mockPi as any);
  if (!capturedTool) throw new Error("edit tool was not registered");
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}
function makeFixtureFile(): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-output-"));
  const filePath = resolve(dir, "sample.ts");
  writeFileSync(filePath, [
    "const one = 1;",
    "const two = 2;",
    "const three = 3;",
  ].join("\n"), "utf-8");
  return filePath;
}
function getTextContent(result: any): string {
  return result.content.find((c: any) => c.type === "text")?.text ?? "";
}
describe("buildEditOutput", () => {
  beforeAll(async () => {
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("projects successful anchor-edit results through one shared builder", async () => {
    const spy = vi.spyOn(editOutputModule, "buildEditOutput");
    const filePath = makeFixtureFile();
    const originalLines = readFileSync(filePath, "utf-8").split("\n");
    const anchor1 = `1:${computeLineHash(1, originalLines[0])}`;
    const anchor2 = `2:${computeLineHash(2, originalLines[1])}`;
    const result = await callEditTool({
      path: filePath,
      edits: [
        { set_line: { anchor: anchor1, new_text: originalLines[0] } },
        { set_line: { anchor: anchor2, new_text: "const two = 22;" } },
      ],
    });

    const built = spy.mock.results.at(-1)?.value;
    expect(built.text).toContain(`Edited ${filePath} (2 changes, +1 -1 line)`);
    expect(built.ptcValue.summary).toBe(`Updated ${filePath}`);
    expect(getTextContent(result)).toBe(built.text);
    expect(result.details?.ptcValue).toEqual(built.ptcValue);
  });
  it("pluralizes the visible summary for single-line insert diffs", () => {
    const insertOnly = buildEditOutput({
      path: "/tmp/test.ts",
      displayPath: "test.ts",
      diff: "@@ -1 +1,2 @@\n const x = 1;\n+const y = 2;",
      firstChangedLine: 1,
      warnings: [],
      noopEdits: [],
      edits: [{ insert_after: { anchor: "1:abc", new_text: "const y = 2;\n" } }],
    });
    expect(insertOnly.text).toContain("Edited test.ts (1 change, +1 -0 line)");
  });
  it("projects legacy normalization warnings through the shared builder", async () => {
    const spy = vi.spyOn(editOutputModule, "buildEditOutput");
    const filePath = makeFixtureFile();

    const result = await callEditTool({
      path: filePath,
      oldText: "const two = 2;",
      newText: "const two = 22;",
    });

    const built = spy.mock.results.at(-1)?.value;
    expect(built.text.includes("Warnings:")).toBe(true);
    expect(getTextContent(result)).toBe(built.text);
    expect(result.details?.ptcValue).toEqual(built.ptcValue);
  });
});
