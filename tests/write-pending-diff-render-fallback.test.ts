import { describe, it, expect, vi } from "vitest";
import { setCapabilities } from "@earendil-works/pi-tui";
import { mkdtempSync, readFileSync } from "node:fs";
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

describe("write renderCall preview fallback", () => {
	it("keeps the summary after a skipped preview", async () => {
		setCapabilities({ images: null, trueColor: true, hyperlinks: false });
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-write-pending-fallback-"));
		const tool = getWriteTool();
		const context: any = { argsComplete: false, executionStarted: false, cwd, state: {}, invalidate: vi.fn(), lastComponent: undefined };
		const args = { path: "large.txt", content: "x".repeat(1024 * 1024 + 1) };

		expect(() => tool.renderCall(args, theme, context)).not.toThrow();
		const rendered = textOf(tool.renderCall(args, theme, context));
		expect(rendered).toContain("write");
		expect(rendered).not.toContain("pending");

		const result = await tool.execute("write-large", args, new AbortController().signal, undefined, { cwd });
		expect(result.isError).not.toBe(true);
		expect(readFileSync(resolve(cwd, "large.txt"), "utf-8")).toBe(args.content);
	});
});
