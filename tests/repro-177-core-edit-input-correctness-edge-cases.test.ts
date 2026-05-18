import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { Value } from "@sinclair/typebox/value";
import { registerEditTool } from "../src/edit.js";
import { registerWriteTool } from "../src/write.js";
import { buildPendingEditPreviewData } from "../src/pending-diff-preview.js";

function captureTool(register: (pi: any, options?: any) => any, options?: any) {
  let tool: any;
  register({
    registerTool(def: any) {
      tool = def;
    },
  }, options);
  if (!tool) throw new Error("tool was not registered");
  return tool;
}

function textOf(result: any): string {
  return result.content?.find((part: any) => part.type === "text")?.text ?? "";
}

describe("repro 177 — core edit input correctness edge cases", () => {
  beforeAll(async () => {
  });

  it("insert_after on the synthetic empty-file anchor inserts the first line without a leading blank", async () => {
    const root = resolve(process.cwd(), "tmp");
    mkdirSync(root, { recursive: true });
    const dir = mkdtempSync(resolve(root, "pi-repro-177-empty-"));
    const filePath = resolve(dir, "empty.txt");
    const writeTool = captureTool(registerWriteTool);
    const editTool = captureTool(registerEditTool, { wasReadInSession: () => true });

    const writeResult = await writeTool.execute("write", { path: filePath, content: "" }, new AbortController().signal, () => {}, { cwd: process.cwd() });
    expect(textOf(writeResult)).toBe("1:d05|");

    const preview = await buildPendingEditPreviewData({
      path: filePath,
      edits: [{ insert_after: { anchor: "1:d05", new_text: "first" } }],
    }, process.cwd());
    expect(preview.type).toBe("ok");
    if (preview.type === "ok") expect(preview.data.nextContent).toBe("first");

    await editTool.execute("edit", {
      path: filePath,
      edits: [{ insert_after: { anchor: "1:d05", new_text: "first" } }],
    }, new AbortController().signal, () => {}, { cwd: process.cwd() });

    expect(readFileSync(filePath, "utf8")).toBe("first");
  });

  it("bare-CR write content is rejected before unusable anchors are emitted", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-repro-177-cr-"));
    const filePath = resolve(dir, "bare-cr.txt");
    const writeTool = captureTool(registerWriteTool);

    const writeResult = await writeTool.execute("write", { path: filePath, content: "a\rb\r" }, new AbortController().signal, () => {}, { cwd: process.cwd() });

    expect(writeResult.isError).toBe(true);
    expect(textOf(writeResult)).toContain("bare CR");
    expect(writeResult.details?.ptcValue?.error?.code).toBe("bare-cr");
    expect(writeResult.details?.ptcValue?.lines).toEqual([]);
  });

  it("schema permits common edits[] old_text/new_text mistake so custom guidance can run", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-repro-177-shape-"));
    const filePath = resolve(dir, "shape.txt");
    const writeTool = captureTool(registerWriteTool);
    const editTool = captureTool(registerEditTool, { wasReadInSession: () => true });
    const commonMistake = {
      path: filePath,
      edits: [{ old_text: "a", new_text: "b" }],
    };

    await writeTool.execute("write", { path: filePath, content: "const a = 1;\n" }, new AbortController().signal, () => {}, { cwd: process.cwd() });

    expect(Value.Check(editTool.parameters, commonMistake)).toBe(true);
    const result = await editTool.execute("edit", commonMistake, new AbortController().signal, () => {}, { cwd: process.cwd() });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("edits[0] has top-level 'old_text'/'new_text'");
    expect(textOf(result)).toContain("Use {replace: {old_text, new_text}}");
    expect(result.details?.ptcValue?.error?.code).toBe("invalid-edit-variant");
  });

  it("insert_after at EOF without a final newline reports an insertion-only summary", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-repro-177-nofinal-"));
    const filePath = resolve(dir, "nofinal.txt");
    const writeTool = captureTool(registerWriteTool);
    const editTool = captureTool(registerEditTool, { wasReadInSession: () => true });

    await writeTool.execute("write", { path: filePath, content: "alpha\nbeta" }, new AbortController().signal, () => {}, {
      cwd: process.cwd(),
    });
    const editResult = await editTool.execute("edit", {
      path: filePath,
      edits: [{ insert_after: { anchor: "2:589", new_text: "gamma" } }],
    }, new AbortController().signal, () => {}, { cwd: process.cwd() });

    expect(textOf(editResult)).toContain("+1 -0 line");
    expect(readFileSync(filePath, "utf8")).toBe("alpha\nbeta\ngamma");
  });
});
