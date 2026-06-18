import { afterEach, describe, expect, it } from "vitest";
import { registerReadTool } from "../src/read.js";

const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };
function tool(): any { let registered: any; registerReadTool({ registerTool(def: any) { registered = def; } } as any, {} as any); return registered; }
function textOf(component: any, width = 80): string { return component?.text ?? component?.render?.(width)?.join("\n") ?? ""; }

function makeResult(lineCount: number): any {
  const lines = Array.from({ length: lineCount }, (_, i) => `${i + 1}:a${i}|line ${i + 1}`);
  return {
    content: [{ type: "text", text: lines.join("\n") }],
    details: { ptcValue: { tool: "read", range: { startLine: 1, endLine: lineCount, totalLines: lineCount }, truncation: null, symbol: null, map: { requested: false, appended: false }, warnings: [] } },
  };
}

describe("read collapsed tail preview", () => {
  const originalEnv = process.env.PI_HASHLINE_PREVIEW_LINES;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.PI_HASHLINE_PREVIEW_LINES;
    else process.env.PI_HASHLINE_PREVIEW_LINES = originalEnv;
  });

  it("shows the last 5 hashlined lines plus an earlier-lines hint", () => {
    delete process.env.PI_HASHLINE_PREVIEW_LINES;
    const rendered = textOf(tool().renderResult(makeResult(7), {}, theme, {}));
    expect(rendered).toContain("↳ loaded 7 lines");
    expect(rendered).toContain("… (2 earlier lines");
    expect(rendered).toContain("7:a6|line 7");
    expect(rendered).toContain("3:a2|line 3");
    expect(rendered).not.toContain("2:a1|line 2");
  });

  it("restores content-free collapsed output when previewLines=0", () => {
    process.env.PI_HASHLINE_PREVIEW_LINES = "0";
    const rendered = textOf(tool().renderResult(makeResult(3), {}, theme, {}));
    expect(rendered).toBe("↳ loaded 3 lines • Ctrl+O to expand");
  });

  it("does not mutate model-facing text or ptcValue", () => {
    delete process.env.PI_HASHLINE_PREVIEW_LINES;
    const result = makeResult(7);
    const beforeText = result.content[0].text;
    const beforePtc = JSON.stringify(result.details.ptcValue);
    tool().renderResult(result, {}, theme, {});
    expect(result.content[0].text).toBe(beforeText);
    expect(JSON.stringify(result.details.ptcValue)).toBe(beforePtc);
  });
});
