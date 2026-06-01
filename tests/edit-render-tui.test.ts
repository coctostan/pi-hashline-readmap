import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resetCapabilitiesCache, setCapabilities } from "@earendil-works/pi-tui";
import { tmpdir } from "node:os";
import { registerEditTool } from "../src/edit.js";
import { __resetHashlineSettingsPathsForTest, __setHashlineSettingsPathsForTest } from "../src/hashline-settings.js";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };
function textOf(component: any, width = 120): string { return component?.text ?? component?.render?.(width)?.join("\n") ?? ""; }
function tool(): any { let registered: any; registerEditTool({ registerTool(def: any) { registered = def; } } as any, { wasReadInSession: () => true } as any); return registered; }

describe("edit TUI renderer", () => {
  const originalEnv = process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
  beforeEach(() => {
    delete process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
    const root = join(tmpdir(), `edit-render-tui-${randomBytes(6).toString("hex")}`);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath: join(root, "repo/.pi/hashline-readmap/settings.json"),
    });
  });
  afterEach(() => {
    resetCapabilitiesCache();
    if (originalEnv === undefined) delete process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
    else process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY = originalEnv;
    __resetHashlineSettingsPathsForTest();
  });
  it("shows edit summary before final diff and preserves model-facing data", () => {
    const result: any = { content: [{ type: "text", text: "1:abc|one\n2:def|TWO" }], details: { diff: "-2 two\n+2 TWO", diffData: { version: 1, stats: { added: 1, removed: 1, context: 0 }, entries: [{ kind: "remove", oldLine: 2, text: "two" }, { kind: "add", newLine: 2, text: "TWO" }] }, ptcValue: { warnings: [], noopEdits: [], semanticSummary: { classification: "semantic" }, diffData: { sentinel: true } } } };
    const before = JSON.stringify(result.details);
    const rendered = textOf(tool().renderResult(result, { expanded: true, width: 80 }, theme, { expanded: true, width: 80 }), 80);
    expect(rendered.split("\n")[0]).toBe("↳ edited +1 -1 • semantic");
    expect(rendered).toContain("↳ diff +1 -1 • 1 hunk • 1 file • unified");
    expect(rendered).toContain("▌+ 2 │ TWO");
    expect(JSON.stringify(result.details)).toBe(before);
  });


  it("renders compact edit call grammar", () => {
    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    const t = tool();
    expect(textOf(t.renderCall({ path: "tmp/file.txt", edits: [{ replace: { old_text: "a", new_text: "b" } }] }, theme, { argsComplete: true }))).toBe("edit tmp/file.txt (1 edit)");
  });

  it("wraps the edit path title in an OSC 8 hyperlink when supported", () => {
    const cwd = process.cwd();
    const expectedUrl = pathToFileURL(resolve(cwd, "tmp/file.txt")).href;
    const args = { path: "tmp/file.txt", edits: [{ replace: { old_text: "a", new_text: "b" } }] };

    setCapabilities({ images: null, trueColor: true, hyperlinks: true });
    const linked = textOf(tool().renderCall(args, theme, { argsComplete: true, cwd }));
    expect(linked).toContain("\u001b]8;;file:///");
    expect(linked).toContain(`\u001b]8;;${expectedUrl}\u001b\\`);
    expect(linked).toContain("tmp/file.txt");
    expect(linked).toContain("(1 edit)");

    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    expect(textOf(tool().renderCall(args, theme, { argsComplete: true, cwd }))).toBe("edit tmp/file.txt (1 edit)");
  });

  it("keeps no-op and expanded error details visible", () => {
    const t = tool();
    const err = { isError: true, content: [{ type: "text", text: "First line\nSecond line" }], details: { diff: "", ptcValue: { warnings: [], noopEdits: [] } } };
    expect(textOf(t.renderResult(err, {}, theme, {}))).toBe("↳ First line");
    expect(textOf(t.renderResult(err, { expanded: true }, theme, { expanded: true }))).toContain("Second line");
    const noop = { isError: true, content: [{ type: "text", text: "No changes made" }], details: { diff: "", ptcValue: { warnings: [], noopEdits: [{}] } } };
    expect(textOf(t.renderResult(noop, {}, theme, {}))).toBe("↳ no-op");
  });


  it("uses summary grammar for pending edit results", () => {
    expect(textOf(tool().renderResult({ content: [] }, {}, theme, { isPartial: true }))).toBe("↳ pending edit");
  });

  it("uses the same visual grammar for pending edit previews", async () => {
    const cwd = mkdtempSync(resolve(tmpdir(), "pi-edit-render-"));
    const filePath = resolve(cwd, "sample.ts");
    writeFileSync(filePath, "const value = 1;\n", "utf-8");
    const t = tool();
    const args = { path: filePath, edits: [{ replace: { old_text: "const value = 1;", new_text: "const value = 2;" } }] };
    const context: any = { argsComplete: false, cwd, state: {}, invalidate: vi.fn(), expanded: true };
    const first = t.renderCall(args, theme, context);
    await Promise.resolve();
    const second = t.renderCall(args, theme, { ...context, lastComponent: first });
    const rendered = textOf(second);
    expect(rendered).toContain("↳ pending edit");
    expect(rendered).toContain("↳ diff +1 -1");
  });
});
