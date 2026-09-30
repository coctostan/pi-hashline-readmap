import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { it, expect, vi } from "vitest";
const delegated = vi.hoisted(() => ({
	execute: vi.fn(async (_id: string, _params: any, _signal: any, _update: any, ctx?: any) => ({
		content: [{ type: "image", data: ctx?.model?.id ?? "missing-model", mimeType: "image/png" }], details: {},
	})),
}));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
	...await importOriginal<typeof import("@earendil-works/pi-coding-agent")>(),
	createReadTool: () => ({ execute: delegated.execute }),
}));
import { registerReadTool } from "../src/read.js";
it("native image behavior receives context for extension-detected images", async () => {
	const directory = mkdtempSync(resolve(tmpdir(), "read-ctx-"));
	try {
		const path = resolve(directory, "image.png");
		writeFileSync(path, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lBBkGQAAAABJRU5ErkJggg==", "base64"));
		let tool: any;
		registerReadTool({ registerTool(def: any) { tool = def; } } as any);
		const ctx = { cwd: directory, model: { provider: "anthropic", id: "test-model" } };
		const signal = new AbortController().signal;
		const onUpdate = vi.fn();
		const result = await tool.execute("read-ctx", { path }, signal, onUpdate, ctx);
		expect(result.content.find((item: any) => item.type === "image").data).toBe("test-model");
		expect(delegated.execute).toHaveBeenLastCalledWith("read-ctx", expect.objectContaining({ path }), signal, onUpdate, ctx);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
