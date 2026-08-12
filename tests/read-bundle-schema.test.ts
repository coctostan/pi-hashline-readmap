import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applyHashlineEdits } from "../src/hashline.js";
import { registerReadTool } from "../src/read.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function getReadTool() {
  let capturedTool: any = null;
  registerReadTool({ registerTool(def: any) { capturedTool = def; } } as any);
  if (!capturedTool) throw new Error("read tool was not registered");
  return capturedTool;
}

async function callReadTool(params: { path: string; offset?: number; limit?: number; symbol?: string; map?: boolean; bundle?: "local"; }) {
  const tool = await getReadTool();
  return tool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getTextContent(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

describe("read bundle schema validation", () => {
  it("composes a capped symbol, local support, and an explicit map with reusable anchors", async () => {
    const tool = await getReadTool();
    expect(tool.parameters.properties.bundle).toBeDefined();
    expect(tool.parameters.properties.bundle.const).toBe("local");
    expect(tool.parameters.required ?? []).not.toContain("bundle");

    const filePath = resolve(fixturesDir, "small.ts");
    const result = await callReadTool({
      path: filePath,
      symbol: "createDemoDirectory",
      limit: 2,
      bundle: "local",
      map: true,
    });
    const text = getTextContent(result);
    const rows = text.split("\n").flatMap((line: string) => {
      const match = line.match(/^(\d+):([0-9a-f]{3})\|/);
      return match ? [{ line: Number(match[1]), anchor: `${match[1]}:${match[2]}` }] : [];
    });
    const requestedAnchor = rows.find((row) => row.line === 45)?.anchor;
    const supportAnchor = rows.find((row) => row.line === 20)?.anchor;

    expect(result.isError).not.toBe(true);
    expect(result.details.ptcValue.range).toEqual({ startLine: 45, endLine: 46, totalLines: 49 });
    expect(result.details.ptcValue.symbol).toMatchObject({
      name: "createDemoDirectory",
      startLine: 45,
      endLine: 49,
    });
    expect(result.details.ptcValue.continuation).toEqual({ nextOffset: 47 });
    expect(result.details.ptcValue.bundle).toMatchObject({
      mode: "local",
      applied: true,
      localSupport: [
        { name: "addUser", kind: "method", startLine: 20, endLine: 33 },
      ],
    });
    expect(result.details.ptcValue.map).toEqual({ requested: true, appended: true });
    expect(text.indexOf("## Requested symbol")).toBeLessThan(text.indexOf("## Local support"));
    expect(text.indexOf("## Local support")).toBeLessThan(text.indexOf("File Map:"));
    expect(result.details.contextHygiene.rehydrate).toEqual({
      tool: "read",
      input: { path: filePath, limit: 2, symbol: "createDemoDirectory", map: true, bundle: "local" },
    });
    expect(requestedAnchor).toBeDefined();
    expect(supportAnchor).toBeDefined();

    const original = readFileSync(filePath, "utf-8");
    const edited = applyHashlineEdits(original, [
      { set_line: { anchor: requestedAnchor!, new_text: "// requested-anchor" } },
      { set_line: { anchor: supportAnchor!, new_text: "// support-anchor" } },
    ]);
    expect(edited.firstChangedLine).toBe(20);
    expect(edited.content).toContain("// requested-anchor");
    expect(edited.content).toContain("// support-anchor");
  });
});
