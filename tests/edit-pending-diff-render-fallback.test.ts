import { afterEach, describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { registerEditTool } from "../src/edit.js";

function getEditTool(): any {
	let tool: any;
	registerEditTool({ registerTool(def: any) { tool = def; } } as any);
	if (!tool) throw new Error("edit tool was not registered");
	return tool;
}

function textOf(component: any): string {
	return component?.text ?? component?.render?.(120)?.join("\n") ?? "";
}

const theme = {
	fg: (_style: string, text: string) => text,
	bold: (text: string) => text,
};

describe("edit renderCall preview fallback", () => {
	afterEach(() => vi.unstubAllEnvs());
	it("projects first-occurrence replace preview and executes the same change", async () => {
		vi.stubEnv("PI_HASHLINE_EDIT_DIFF_DISPLAY", "collapsed");
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-edit-pending-fallback-"));
		const filePath = resolve(cwd, "sample.ts");
		writeFileSync(filePath, "const value = 1;\nconst value = 1;\n", "utf-8");
		const tool = getEditTool();
		const context: any = { argsComplete: false, executionStarted: false, cwd, state: {}, invalidate: vi.fn(), lastComponent: undefined };
		const args = { path: filePath, edits: [{ replace: { old_text: "const value = 1;", new_text: "const value = 2;" } }] };

		expect(() => tool.renderCall(args, theme, context)).not.toThrow();
		await Promise.resolve();
		const rendered = textOf(tool.renderCall(args, theme, context));
		expect(rendered).toContain("edit");
		expect(rendered).not.toContain("pending edit");

		const result = await tool.execute("edit-call", args, new AbortController().signal, undefined, { cwd });
		expect(result.isError).not.toBe(true);
		expect(readFileSync(filePath, "utf-8")).toBe("const value = 2;\nconst value = 1;\n");
	});
});
