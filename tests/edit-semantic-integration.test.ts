import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash } from "../src/hashline.js";
import { registerEditTool } from "../src/edit.js";

async function callEditTool(params: Record<string, unknown>) {
  let capturedTool: any = null;
  registerEditTool({ registerTool(def: any) { capturedTool = def; } } as any);
  if (!capturedTool) throw new Error("edit tool was not registered");
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function makeFixture(content: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-cls-"));
  const filePath = resolve(dir, "test.ts");
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("edit semantic classification integration", () => {
  beforeAll(async () => {
  });

  it("includes semanticSummary with classification 'semantic' after a real code change", async () => {
    const filePath = makeFixture("const x = 1;\nconst y = 2;\n");
    const lines = readFileSync(filePath, "utf-8").split("\n");
    const anchor = `1:${computeLineHash(1, lines[0])}`;

    const result = await callEditTool({
      path: filePath,
      edits: [{ set_line: { anchor, new_text: "const x = 999;" } }],
    });

    const ptc = result.details?.ptcValue;
    expect(ptc.semanticSummary).toBeDefined();
    expect(ptc.semanticSummary.classification).toBe("semantic");
    expect(typeof ptc.semanticSummary.difftasticAvailable).toBe("boolean");
  });

  it("includes semanticSummary with classification 'whitespace-only' after an indent change", async () => {
    const filePath = makeFixture("  const x = 1;\n");
    const lines = readFileSync(filePath, "utf-8").split("\n");
    const anchor = `1:${computeLineHash(1, lines[0])}`;

    const result = await callEditTool({
      path: filePath,
      edits: [{ set_line: { anchor, new_text: "    const x = 1;" } }],
    });

    const ptc = result.details?.ptcValue;
    expect(ptc.semanticSummary).toBeDefined();
    expect(ptc.semanticSummary.classification).toBe("whitespace-only");
  });

  it("surfaces the Edited summary without adding semantic noise for plain semantic edits", async () => {
    const filePath = makeFixture("const a = 1;\n");
    const lines = readFileSync(filePath, "utf-8").split("\n");
    const anchor = `1:${computeLineHash(1, lines[0])}`;
    const result = await callEditTool({
      path: filePath,
      edits: [{ set_line: { anchor, new_text: "const a = 2;" } }],
    });
    const text = result.content.find((c: any) => c.type === "text")?.text ?? "";
    expect(text.split("\n")[0]).toBe(`Edited ${filePath} (1 change, +1 -1 line)`);
    expect(text).not.toContain("[semantic:");
    expect(text).not.toContain("⚠ Edit classified as whitespace-only");
  });
});
