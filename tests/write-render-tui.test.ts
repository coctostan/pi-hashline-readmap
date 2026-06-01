import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { resetCapabilitiesCache, setCapabilities } from "@earendil-works/pi-tui";
import { registerWriteTool } from "../src/write.js";

const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };
function textOf(component: any, width = 120): string { return component?.text ?? component?.render?.(width)?.join("\n") ?? ""; }
function tool(): any { let registered: any; registerWriteTool({ registerTool(def: any) { registered = def; } } as any, {} as any); return registered; }

afterEach(() => {
  resetCapabilitiesCache();
});

describe("write TUI renderer", () => {
  it("shows created and overwritten state before final diff without mutating details", () => {
    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    const t = tool();
    expect(textOf(t.renderCall({ path: "tmp/file.txt", content: "one\ntwo\nthree" }, theme, {}))).toBe("write tmp/file.txt (3 lines • 13 B)");
    const baseDiffData = { version: 1, stats: { added: 3, removed: 0, context: 0 }, entries: [{ kind: "add", newLine: 1, text: "one" }, { kind: "add", newLine: 2, text: "two" }, { kind: "add", newLine: 3, text: "three" }] };
    // Pure create: diff UI is suppressed — every line is an add. The expanded
    // form shows the new file's contents indented (no gutter, no line numbers,
    // no colors).
    const createdPtcLines = [
      { line: 1, hash: "abc", anchor: "1:abc", raw: "one", display: "one" },
      { line: 2, hash: "def", anchor: "2:def", raw: "two", display: "two" },
      { line: 3, hash: "aaa", anchor: "3:aaa", raw: "three", display: "three" },
    ];
    const created: any = { content: [{ type: "text", text: "1:abc|one\n2:def|two\n3:aaa|three" }], details: { writeState: "created", diffData: baseDiffData, ptcValue: { tool: "write", diffData: { sentinel: true }, lines: createdPtcLines } } };
    const before = JSON.stringify(created.details);

    const createdCollapsed = textOf(t.renderResult(created, {}, theme, {}), 80);
    expect(createdCollapsed).toBe("↳ created • Ctrl+O to expand");

    const createdExpanded = textOf(t.renderResult(created, { expanded: true, width: 80 }, theme, { expanded: true, width: 80 }), 80);
    expect(createdExpanded.split("\n")[0]).toBe("↳ created");
    expect(createdExpanded).toContain("  1 │ one");
    expect(createdExpanded).toContain("  2 │ two");
    expect(createdExpanded).toContain("  3 │ three");
    expect(createdExpanded).not.toContain("diff +");
    expect(createdExpanded).not.toContain("▌+");
    expect(JSON.stringify(created.details)).toBe(before);

    // Overwrite: diff UI is preserved — the old vs new comparison still has signal.
    const overwrittenDiffData = { version: 1, stats: { added: 1, removed: 1, context: 0 }, entries: [{ kind: "remove", oldLine: 1, text: "old" }, { kind: "add", newLine: 1, text: "new" }] };
    const overwritten: any = { content: created.content, details: { writeState: "overwritten", diffData: overwrittenDiffData, ptcValue: { tool: "write" } } };
    const overwrittenRendered = textOf(t.renderResult(overwritten, { expanded: true, width: 80 }, theme, { expanded: true, width: 80 }), 80);
    expect(overwrittenRendered.split("\n")[0]).toBe("↳ overwritten");
    expect(overwrittenRendered).toContain("↳ diff +1 -1 • 1 hunk • 1 file • unified");
    expect(overwrittenRendered).toContain("▌- 1 │ old");
    expect(overwrittenRendered).toContain("▌+ 1 │ new");

    const collapsed: any = { content: created.content, details: { ...created.details, writeState: "overwritten", diffData: overwrittenDiffData } };
    expect(textOf(t.renderResult(collapsed, {}, theme, {}))).toBe("↳ overwritten • Ctrl+O to expand");
  });

  it("wraps the write path title in an OSC 8 hyperlink when supported", () => {
    const cwd = process.cwd();
    const expectedUrl = pathToFileURL(resolve(cwd, "tmp/file.txt")).href;
    const args = { path: "tmp/file.txt", content: "one\ntwo" };

    setCapabilities({ images: null, trueColor: true, hyperlinks: true });
    const linked = textOf(tool().renderCall(args, theme, { cwd }));
    expect(linked).toContain("\u001b]8;;file:///");
    expect(linked).toContain(`\u001b]8;;${expectedUrl}\u001b\\`);
    expect(linked).toContain("tmp/file.txt");
    expect(linked).toContain("(2 lines • 7 B)");

    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    expect(textOf(tool().renderCall(args, theme, { cwd }))).toBe("write tmp/file.txt (2 lines • 7 B)");
  });


  it("keeps write error summaries visible and expands details", () => {
    const t = tool();
    const failed: any = { isError: true, content: [{ type: "text", text: "Permission denied\nfull detail" }], details: { ptcValue: { ok: false } } };
    expect(textOf(t.renderResult(failed, {}, theme, {}))).toBe("↳ Permission denied");
    expect(textOf(t.renderResult(failed, { expanded: true }, theme, { expanded: true }))).toContain("full detail");
  });

  it("uses the same visual grammar for pending write previews", () => {
    const cwd = mkdtempSync(resolve(tmpdir(), "pi-write-render-"));
    writeFileSync(resolve(cwd, "old.txt"), "old\n", "utf-8");
    const t = tool();

    // Pending create: no diff UI — expanded shows the new content indented.
    const createContext: any = { cwd, state: {}, invalidate: vi.fn(), expanded: true };
    const first = t.renderCall({ path: "new.txt", content: "one\ntwo" }, theme, createContext);
    const second = t.renderCall({ path: "new.txt", content: "one\ntwo" }, theme, { ...createContext, lastComponent: first });
    const createdText = textOf(second);
    expect(createdText).toContain("↳ pending create");
    expect(createdText).toContain("  1 │ one");
    expect(createdText).toContain("  2 │ two");
    expect(createdText).not.toContain("diff +");
    expect(createdText).not.toContain("▌+");

    // Pending overwrite: diff UI is preserved — old vs new still carries signal.
    const overwriteContext: any = { cwd, state: {}, invalidate: vi.fn(), expanded: true };
    const third = t.renderCall({ path: "old.txt", content: "old\nnew" }, theme, overwriteContext);
    const fourth = t.renderCall({ path: "old.txt", content: "old\nnew" }, theme, { ...overwriteContext, lastComponent: third });
    const overwriteText = textOf(fourth);
    expect(overwriteText).toContain("↳ pending overwrite");
    expect(overwriteText).toContain("↳ diff +1 -0");
  });

  it("collapses the pending preview to just the call line once execution has started", () => {
    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    const cwd = mkdtempSync(resolve(tmpdir(), "pi-write-exec-collapse-"));
    writeFileSync(resolve(cwd, "old.txt"), "old\n", "utf-8");
    const t = tool();

    // Before execution: pending preview is visible (with content for create, diff for overwrite).
    const beforeCreate: any = { cwd, state: {}, invalidate: vi.fn(), expanded: true, argsComplete: true, executionStarted: false };
    const beforeCreateText = textOf(t.renderCall({ path: "new.txt", content: "one\ntwo" }, theme, beforeCreate));
    expect(beforeCreateText).toContain("↳ pending create");

    const beforeOverwrite: any = { cwd, state: {}, invalidate: vi.fn(), expanded: true, argsComplete: true, executionStarted: false };
    const beforeOverwriteText = textOf(t.renderCall({ path: "old.txt", content: "old\nnew" }, theme, beforeOverwrite));
    expect(beforeOverwriteText).toContain("↳ pending overwrite");

    // After execution starts: the call row drops the pending preview entirely.
    // renderResult is responsible for the post-exec story (↳ created / ↳ overwritten).
    const afterCreate: any = { cwd, state: {}, invalidate: vi.fn(), expanded: true, argsComplete: true, executionStarted: true };
    const afterCreateText = textOf(t.renderCall({ path: "new.txt", content: "one\ntwo" }, theme, afterCreate));
    expect(afterCreateText).toBe("write new.txt (2 lines • 7 B)");
    expect(afterCreateText).not.toContain("pending");
    expect(afterCreateText).not.toContain("  one");

    const afterOverwrite: any = { cwd, state: {}, invalidate: vi.fn(), expanded: true, argsComplete: true, executionStarted: true };
    const afterOverwriteText = textOf(t.renderCall({ path: "old.txt", content: "old\nnew" }, theme, afterOverwrite));
    expect(afterOverwriteText).toBe("write old.txt (2 lines • 7 B)");
    expect(afterOverwriteText).not.toContain("pending");
    expect(afterOverwriteText).not.toContain("diff +");
  });

  it("renders the create content preview when theme.fg uses `this` (regression: bind theme.fg)", () => {
    // Real pi themes implement Theme.fg as a method on a class instance that
    // reads `this.fgColors`. If the renderer extracts `theme.fg` without
    // binding, calling it standalone crashes with "Cannot read properties of
    // undefined (reading 'fgColors')". This stub mimics that contract.
    class MethodTheme {
      tag: string;
      constructor() { this.tag = "truecolor"; }
      fg(style: string, text: string) { if (!this.tag) throw new TypeError("this is undefined"); return `[${style}]${text}[/${style}]`; }
      bold(text: string) { return text; }
    }
    const methodTheme: any = new MethodTheme();
    const t = tool();
    const ptcLines = [
      { line: 1, hash: "abc", anchor: "1:abc", raw: "one", display: "one" },
      { line: 2, hash: "def", anchor: "2:def", raw: "two", display: "two" },
    ];
    const created: any = { content: [{ type: "text", text: "1:abc|one\n2:def|two" }], details: { writeState: "created", ptcValue: { tool: "write", lines: ptcLines } } };
    let rendered: any;
    expect(() => { rendered = t.renderResult(created, { expanded: true, width: 80 }, methodTheme, { expanded: true, width: 80 }); }).not.toThrow();
    const out = textOf(rendered, 80);
    expect(out).toContain("↳ created");
    expect(out).toContain("[dim]1 │ [/dim]one");
    expect(out).toContain("[dim]2 │ [/dim]two");
  });
});
