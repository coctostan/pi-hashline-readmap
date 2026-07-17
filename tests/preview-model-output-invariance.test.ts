import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { registerBashRendererTool } from "../src/bash-renderer.js";
import { registerGrepTool } from "../src/grep.js";

const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };
function textOf(component: any, width = 120): string { return component?.text ?? component?.render?.(width)?.join("\n") ?? ""; }

function bashTool(): any {
  let registered: any;
  registerBashRendererTool({ registerTool(def: any) { registered = def; } } as any, { createBuiltInBashTool: () => ({ execute: async () => ({ content: [] }), parameters: {} }) });
  return registered;
}
function grepTool(): any { let registered: any; registerGrepTool({ registerTool(def: any) { registered = def; } } as any, {} as any); return registered; }

describe("collapsed preview does not mutate model-facing output", () => {
  const originalEnv = process.env.PI_HASHLINE_PREVIEW_LINES;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.PI_HASHLINE_PREVIEW_LINES;
    else process.env.PI_HASHLINE_PREVIEW_LINES = originalEnv;
  });

  it("leaves bash result content and details untouched", () => {
    delete process.env.PI_HASHLINE_PREVIEW_LINES;
    const text = ["l1", "l2", "l3", "l4", "l5", "l6", "l7"].join("\n");
    const result: any = { content: [{ type: "text", text }], details: { bashOriginalOutput: { path: "/tmp/x" }, bashContextGuard: { trimmed: true } } };
    const beforeContent = JSON.stringify(result.content);
    const beforeDetails = JSON.stringify(result.details);
    textOf(bashTool().renderResult(result, {}, theme, {}));
    expect(JSON.stringify(result.content)).toBe(beforeContent);
    expect(JSON.stringify(result.details)).toBe(beforeDetails);
  });

  it("leaves grep result content and details untouched", () => {
    delete process.env.PI_HASHLINE_PREVIEW_LINES;
    const cwd = process.cwd();
    const lines = Array.from({ length: 7 }, (_, i) => `src/a.ts:${i + 1}:abc|hit ${i + 1}`);
    const result: any = { content: [{ type: "text", text: lines.join("\n") }], details: { ptcValue: { tool: "grep", summary: false, totalMatches: 7, records: [{ path: `${cwd}/src/a.ts`, kind: "match" }] } } };
    const beforeContent = JSON.stringify(result.content);
    const beforeDetails = JSON.stringify(result.details);
    textOf(grepTool().renderResult(result, {}, theme, { cwd }));
    expect(JSON.stringify(result.content)).toBe(beforeContent);
    expect(JSON.stringify(result.details)).toBe(beforeDetails);
  });

  it("keeps the Bash context guard out of the renderResult paths", () => {
    const bashSrc = readFileSync(new URL("../src/bash-renderer.ts", import.meta.url), "utf8");
    const grepSrc = readFileSync(new URL("../src/grep.ts", import.meta.url), "utf8");
    for (const src of [bashSrc, grepSrc]) {
      expect(src).not.toContain("applyBashContextGuard");
    }
  });
});
