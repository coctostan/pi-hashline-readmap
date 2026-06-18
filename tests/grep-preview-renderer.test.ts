import { afterEach, describe, expect, it } from "vitest";
import { registerGrepTool } from "../src/grep.js";

const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };
function tool(): any { let registered: any; registerGrepTool({ registerTool(def: any) { registered = def; } } as any, {} as any); return registered; }
function textOf(component: any, width = 120): string { return component?.text ?? component?.render?.(width)?.join("\n") ?? ""; }

function makeResult(matchLines: string[]): any {
  const cwd = process.cwd();
  return {
    content: [{ type: "text", text: matchLines.join("\n") }],
    details: { ptcValue: { tool: "grep", summary: false, totalMatches: matchLines.length, records: [{ path: `${cwd}/src/a.ts`, kind: "match" }] } },
  };
}

describe("grep collapsed tail preview", () => {
  const originalEnv = process.env.PI_HASHLINE_PREVIEW_LINES;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.PI_HASHLINE_PREVIEW_LINES;
    else process.env.PI_HASHLINE_PREVIEW_LINES = originalEnv;
  });

  it("shows the last 5 match lines plus an earlier-lines hint when collapsed", () => {
    delete process.env.PI_HASHLINE_PREVIEW_LINES;
    const lines = Array.from({ length: 7 }, (_, i) => `src/a.ts:${i + 1}:abc|hit ${i + 1}`);
    const rendered = textOf(tool().renderResult(makeResult(lines), {}, theme, { cwd: process.cwd() }));
    expect(rendered).toContain("↳ 7 matches returned");
    expect(rendered).toContain("… (2 earlier lines");
    expect(rendered).toContain("hit 7");
    expect(rendered).toContain("hit 3");
    expect(rendered).not.toContain("hit 2");
  });

  it("restores content-free collapsed output when previewLines=0", () => {
    process.env.PI_HASHLINE_PREVIEW_LINES = "0";
    const rendered = textOf(tool().renderResult(makeResult(["src/a.ts:1:abc|hit"]), {}, theme, { cwd: process.cwd() }));
    expect(rendered).toBe("↳ 1 match returned • Ctrl+O to expand");
  });

  it("keeps the expanded per-file count list unchanged", () => {
    process.env.PI_HASHLINE_PREVIEW_LINES = "0";
    const rendered = textOf(tool().renderResult(makeResult(["src/a.ts:1:abc|hit"]), { expanded: true }, theme, { expanded: true, cwd: process.cwd() }));
    expect(rendered).toContain("src/a.ts (1)");
  });
});
