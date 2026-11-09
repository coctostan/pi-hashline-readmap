import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerGrepTool } from "../src/grep.js";

let cwd: string;
let outside: string;

beforeAll(() => {
	cwd = realpathSync(mkdtempSync(join(tmpdir(), "grep-cwd-")));
	outside = realpathSync(mkdtempSync(join(tmpdir(), "grep-outside-")));
	mkdirSync(join(cwd, "pkg", "sub"), { recursive: true });
	writeFileSync(join(cwd, "pkg", "sub", "view.ts"), "export const needle = 1;\n");
	writeFileSync(join(outside, "far.ts"), "export const needle = 2;\n");
});

afterAll(() => {
	rmSync(cwd, { recursive: true, force: true });
	rmSync(outside, { recursive: true, force: true });
});

async function grep(params: Record<string, unknown>) {
	let tool: any;
	registerGrepTool({ registerTool: (def: any) => { tool = def; } } as any);
	const result = await tool.execute("call", { pattern: "needle", ...params }, new AbortController().signal, () => {}, { cwd });
	return { text: result.content.find((c: any) => c.type === "text").text as string, value: result.structuredContent };
}

describe("grep names files from the cwd", () => {
	it("names a file under a path argument from the cwd in grouped output", async () => {
		const { text, value } = await grep({ path: "pkg" });
		expect(text).toContain("--- pkg/sub/view.ts (1 matches) ---");
		expect(text).toMatch(/^pkg\/sub\/view\.ts:>>1:[0-9a-f]{3}\|export const needle = 1;$/m);
		expect(value.records[0].path).toBe(join(cwd, "pkg", "sub", "view.ts"));
	});

	it("names a file under a path argument from the cwd in summary output", async () => {
		const { text } = await grep({ path: "pkg", summary: true });
		expect(text.split("\n")).toContain("pkg/sub/view.ts: 1 matches");
	});

	it("names a single-file path argument from the cwd", async () => {
		const { text } = await grep({ path: "pkg/sub/view.ts" });
		expect(text).toContain("--- pkg/sub/view.ts (1 matches) ---");
	});

	it("names a file without a path argument from the cwd", async () => {
		const { text } = await grep({ summary: true });
		expect(text.split("\n")).toContain("pkg/sub/view.ts: 1 matches");
	});

	it("keeps the absolute path of a file outside the cwd", async () => {
		const far = join(outside, "far.ts");
		const grouped = await grep({ path: outside });
		expect(grouped.text).toContain(`--- ${far} (1 matches) ---`);
		expect(grouped.text).toContain(`${far}:>>1:`);
		const summary = await grep({ path: outside, summary: true });
		expect(summary.text.split("\n")).toContain(`${far}: 1 matches`);
	});
});
