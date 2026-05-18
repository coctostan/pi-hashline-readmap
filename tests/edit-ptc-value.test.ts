import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash } from "../src/hashline.js";

async function callEditTool(params: Record<string, unknown>) {
  const { registerEditTool } = await import("../src/edit.js");
  let capturedTool: any = null;
  const mockPi = { registerTool(def: any) { capturedTool = def; } };
  registerEditTool(mockPi as any);
  if (!capturedTool) throw new Error("edit tool was not registered");
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function makeFixtureFile(): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-ptc-"));
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

describe("edit ptcValue", () => {
  beforeAll(async () => {
  });

  it("returns structured status, diff, firstChangedLine, and noop metadata for anchor edits", async () => {
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
    const text = getTextContent(result);
    const ptc = result.details?.ptcValue;
    expect(ptc).toBeDefined();
    expect(ptc.ok).toBe(true);
    expect(ptc.path).toBe(filePath);
    expect(ptc.summary).toBe(`Updated ${filePath}`);
    expect(ptc.firstChangedLine).toBe(2);
    expect(ptc.diff).toContain("const two = 2;");
    expect(ptc.diff).toContain("const two = 22;");
    expect(ptc.warnings).toEqual([]);
    expect(ptc.noopEdits).toEqual([
      {
        editIndex: 0,
        loc: anchor1,
        currentContent: "const one = 1;",
      },
    ]);
    expect(text.split("\n")[0]).toBe(`Edited ${filePath} (2 changes, +1 -1 line)`);
  });

  it("returns legacy normalization warning when using top-level oldText/newText", async () => {
    const filePath = makeFixtureFile();

    const result = await callEditTool({
      path: filePath,
      oldText: "const two = 2;",
      newText: "const two = 22;",
    });

    const ptc = result.details?.ptcValue;

    expect(ptc).toBeDefined();
    expect(ptc.ok).toBe(true);
    expect(ptc.warnings).toContain(
      "Legacy top-level oldText/newText input was normalized to edits[0].replace. Prefer the edits[] format."
    );
  });
});
