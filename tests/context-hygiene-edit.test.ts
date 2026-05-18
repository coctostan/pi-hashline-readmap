import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildFileResource } from "../src/context-hygiene.js";
import { buildEditOutput } from "../src/edit-output.js";
import { computeLineHash } from "../src/hashline.js";

async function callEditTool(params: Record<string, unknown>) {
  const { registerEditTool } = await import("../src/edit.js");
  let capturedTool: any = null;
  registerEditTool({ registerTool(def: any) { capturedTool = def; } } as any);
  if (!capturedTool) throw new Error("edit tool was not registered");
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function makeFixtureFile(): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-context-hygiene-edit-"));
  const filePath = resolve(dir, "sample.ts");
  writeFileSync(filePath, [
    "const one = 1;",
    "const two = 2;",
    "const three = 3;",
  ].join("\n"), "utf-8");
  return filePath;
}

describe("edit contextHygiene metadata", () => {
  beforeAll(async () => {
  });

  it("buildEditOutput returns mutation metadata for the edited file", () => {
    const output = buildEditOutput({
      path: "/tmp/sample.ts",
      displayPath: "sample.ts",
      diff: "@@ -1 +1 @@\n-const x = 1;\n+const x = 2;",
      firstChangedLine: 1,
      warnings: [],
      noopEdits: [],
      edits: [{ set_line: { anchor: "1:abc", new_text: "const x = 2;" } }],
    });

    expect((output as any).contextHygiene).toEqual({
      schemaVersion: 1,
      tool: "edit",
      classification: "mutation",
      resources: [buildFileResource("/tmp/sample.ts")],
    });
    expect((output.ptcValue as any).contextHygiene).toBeUndefined();
    expect(output.ptcValue).toMatchObject({
      tool: "edit",
      ok: true,
      path: "/tmp/sample.ts",
      summary: "Updated sample.ts",
      firstChangedLine: 1,
      warnings: [],
      noopEdits: [],
    });
  });

  it("edit tool attaches contextHygiene beside ptcValue without changing ptcValue", async () => {
    const filePath = makeFixtureFile();
    const originalLines = readFileSync(filePath, "utf-8").split("\n");
    const anchor = `2:${computeLineHash(2, originalLines[1])}`;

    const result = await callEditTool({
      path: filePath,
      edits: [{ set_line: { anchor, new_text: "const two = 22;" } }],
    });

    expect(result.details?.contextHygiene).toEqual({
      schemaVersion: 1,
      tool: "edit",
      classification: "mutation",
      resources: [buildFileResource(filePath)],
    });
    expect((result.details?.ptcValue as any).contextHygiene).toBeUndefined();
    expect(result.details?.ptcValue).toMatchObject({
      tool: "edit",
      ok: true,
      path: filePath,
      summary: `Updated ${filePath}`,
      firstChangedLine: 2,
      warnings: [],
      noopEdits: [],
    });
  });
});
