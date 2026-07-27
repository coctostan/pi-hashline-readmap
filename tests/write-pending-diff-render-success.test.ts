import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { registerWriteTool } from "../src/write.js";

function getWriteTool(): any {
	let tool: any;
	registerWriteTool({ registerTool(def: any) { tool = def; } } as any);
	if (!tool) throw new Error("write tool was not registered");
	return tool;
}

function textOf(component: any): string {
	return component?.text ?? component?.render?.(120)?.join("\n") ?? "";
}

const theme = {
	fg: (_style: string, text: string) => text,
	bold: (text: string) => text,
};

describe("write renderCall pending diff preview", () => {
	it("renders a collapsed pending overwrite preview by default", () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-write-pending-success-"));
		writeFileSync(resolve(cwd, "sample.txt"), "old value\n", "utf-8");
		const tool = getWriteTool();
		const context: any = { argsComplete: true, executionStarted: false, cwd, state: {}, invalidate: vi.fn(), lastComponent: undefined, expanded: false };

		const rendered = tool.renderCall({ path: "sample.txt", content: "new value\n" }, theme, context);
		const text = textOf(rendered);

		expect(text).toContain("↳ pending overwrite");
		expect(text).toContain("Ctrl+O to expand");
		expect(text).not.toContain("↳ diff +1 -1");
		expect(text).not.toContain("▌- 1");
	});

	it("renders the full diff body when expanded", () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-write-pending-expanded-"));
		writeFileSync(resolve(cwd, "sample.txt"), "old value\n", "utf-8");
		const tool = getWriteTool();
		const context: any = { argsComplete: true, executionStarted: false, cwd, state: {}, invalidate: vi.fn(), lastComponent: undefined, expanded: true };

		const rendered = tool.renderCall({ path: "sample.txt", content: "new value\n" }, theme, context);
		const text = textOf(rendered);

		expect(text).toContain("↳ pending overwrite");
		expect(text).toContain("↳ diff +1 -1");
		expect(text).toContain("▌- 1 │ old value");
		expect(text).toContain("▌+ 1 │ new value");
	});

	it("suppresses the diff body for pending create (pure-add) writes", () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-write-pending-create-"));
		const tool = getWriteTool();

		// Collapsed: just the "pending create" header with a Ctrl+O hint. No diff header, no body, no file contents.
		const collapsedContext: any = { argsComplete: true, executionStarted: false, cwd, state: {}, invalidate: vi.fn(), lastComponent: undefined, expanded: false };
		const collapsed = textOf(tool.renderCall({ path: "fresh.txt", content: "hello\nworld\n" }, theme, collapsedContext));
		expect(collapsed).toContain("↳ pending create");
		expect(collapsed).toContain("Ctrl+O to expand");
		expect(collapsed).not.toContain("↳ diff +");
		expect(collapsed).not.toContain("▌+");
		expect(collapsed).not.toContain("hello");

		// Expanded: the new file's contents are shown indented (no gutter, no line numbers, no colors).
		const expandedContext: any = { argsComplete: true, executionStarted: false, cwd, state: {}, invalidate: vi.fn(), lastComponent: undefined, expanded: true };
		const expanded = textOf(tool.renderCall({ path: "fresh.txt", content: "hello\nworld\n" }, theme, expandedContext));
		expect(expanded).toContain("↳ pending create");
		expect(expanded).toContain("  1 │ hello");
		expect(expanded).toContain("  2 │ world");
		expect(expanded).not.toContain("↳ diff +");
		expect(expanded).not.toContain("▌+");
	});
});
