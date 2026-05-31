import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resetCapabilitiesCache, setCapabilities, visibleWidth } from "@earendil-works/pi-tui";
import { registerReadTool } from "../src/read.js";

const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };
function tool(): any { let registered: any; registerReadTool({ registerTool(def: any) { registered = def; } } as any, {} as any); return registered; }
function textOf(component: any, width = 80): string { return component?.text ?? component?.render?.(width)?.join("\n") ?? ""; }
const result = { content: [{ type: "text", text: "1:abc|export function veryLongName(argumentOne: string, argumentTwo: string): void {}" }], details: { ptcValue: { tool: "read", range: { startLine: 1, endLine: 1, totalLines: 1 }, truncation: null, symbol: null, map: { requested: false, appended: false }, warnings: [], lines: [{ line: 1, anchor: "1:abc", text: "export" }] } } };

afterEach(() => {
  resetCapabilitiesCache();
});

describe("read TUI renderer", () => {
  it("uses compact call and collapsed summary by default", () => {
    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    expect(textOf(tool().renderCall({ path: "src/edit.ts", offset: 120, limit: 61 }, theme))).toBe("read src/edit.ts:120-180");
    expect(textOf(tool().renderResult(result, {}, theme, {}))).toBe("↳ loaded 1 line • Ctrl+O to expand");
  });

  it("wraps the read path title in an OSC 8 hyperlink when supported", () => {
    const cwd = process.cwd();
    const expectedUrl = pathToFileURL(resolve(cwd, "src/read.ts")).href;

    setCapabilities({ images: null, trueColor: true, hyperlinks: true });
    const linked = textOf(tool().renderCall({ path: "src/read.ts", offset: 120, limit: 61 }, theme, { cwd }));
    expect(linked).toContain("\u001b]8;;file:///");
    expect(linked).toContain(`\u001b]8;;${expectedUrl}\u001b\\`);
    expect(linked).toContain("src/read.ts:120-180");

    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    expect(textOf(tool().renderCall({ path: "src/read.ts", offset: 120, limit: 61 }, theme, { cwd }))).toBe("read src/read.ts:120-180");
  });

  it("uses summary grammar for pending reads", () => {
    expect(textOf(tool().renderResult({ content: [] }, {}, theme, { isPartial: true }))).toBe("↳ pending read");
  });

  it("renders expanded wrapped detail without changing model-visible payload", () => {
    const beforeText = result.content[0].text;
    const beforePtc = JSON.stringify(result.details.ptcValue);
    const rendered = textOf(tool().renderResult(result, { expanded: true, width: 36 }, theme, { expanded: true, width: 36 }), 36);
    expect(rendered).toContain("↳ loaded 1 line");
    expect(rendered).toContain("1:abc|");
    expect(rendered.split("\n").every((line) => visibleWidth(line) <= 36)).toBe(true);
    expect(result.content[0].text).toBe(beforeText);
    expect(JSON.stringify(result.details.ptcValue)).toBe(beforePtc);
  });
});
