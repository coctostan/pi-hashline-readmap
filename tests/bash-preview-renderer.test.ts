import { afterEach, describe, expect, it } from "vitest";
import { registerBashRendererTool } from "../src/bash-renderer.js";

const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };
function textOf(component: any, width = 120): string { return component?.text ?? component?.render?.(width)?.join("\n") ?? ""; }
function bashTool(): any {
  let registered: any;
  registerBashRendererTool({ registerTool(def: any) { registered = def; } } as any, { createBuiltInBashTool: () => ({ execute: async () => ({ content: [] }), parameters: {} }) });
  return registered;
}

describe("bash collapsed tail preview", () => {
  const originalEnv = process.env.PI_HASHLINE_PREVIEW_LINES;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.PI_HASHLINE_PREVIEW_LINES;
    else process.env.PI_HASHLINE_PREVIEW_LINES = originalEnv;
  });

  it("shows the last 5 lines plus an earlier-lines hint when collapsed", () => {
    delete process.env.PI_HASHLINE_PREVIEW_LINES;
    const text = ["l1", "l2", "l3", "l4", "l5", "l6", "l7"].join("\n");
    const rendered = textOf(bashTool().renderResult({ content: [{ type: "text", text }] }, {}, theme, {}));
    expect(rendered).toContain("↳ 7 lines returned");
    expect(rendered).toContain("… (2 earlier lines");
    expect(rendered).toContain("l7");
    expect(rendered).toContain("l3");
    expect(rendered).not.toContain("\nl2");
  });

  it("shows all lines with no hint when within preview length", () => {
    delete process.env.PI_HASHLINE_PREVIEW_LINES;
    const rendered = textOf(bashTool().renderResult({ content: [{ type: "text", text: "only\ntwo" }] }, {}, theme, {}));
    expect(rendered).toContain("only");
    expect(rendered).toContain("two");
    expect(rendered).not.toContain("earlier line");
  });

  it("restores content-free collapsed output when previewLines=0", () => {
    process.env.PI_HASHLINE_PREVIEW_LINES = "0";
    const text = ["a", "b", "c"].join("\n");
    const rendered = textOf(bashTool().renderResult({ content: [{ type: "text", text }] }, {}, theme, {}));
    expect(rendered).toBe("↳ 3 lines returned • Ctrl+O to expand");
  });

  it("keeps expanded output as the full body", () => {
    process.env.PI_HASHLINE_PREVIEW_LINES = "0";
    const text = ["a", "b", "c"].join("\n");
    const rendered = textOf(bashTool().renderResult({ content: [{ type: "text", text }] }, { expanded: true }, theme, { expanded: true }));
    expect(rendered).toContain("a");
    expect(rendered).toContain("b");
    expect(rendered).toContain("c");
  });
});
