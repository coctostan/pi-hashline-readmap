import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerGrepTool } from "../src/grep.js";

function captureGrepTool(): any {
	let tool: any;
	registerGrepTool({ registerTool(def: any) { tool = def; } } as any);
	return tool;
}

describe("grep limit zero", () => {
	it("does not report truncation when a limit-zero search has no matches", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-grep-limit-zero-"));
		const filePath = join(dir, "sample.txt");
		writeFileSync(filePath, "alpha\nbeta\n", "utf8");

		const result = await captureGrepTool().execute(
			"grep-limit-zero",
			{ pattern: "missing", path: filePath, literal: true, limit: 0 },
			new AbortController().signal,
			() => {},
			{ cwd: process.cwd() },
		);
		const text = result.content.find((item: any) => item.type === "text")?.text ?? "";

		expect(text).toBe("[0 matches in 0 files]");
		expect(result.details.ptcValue).toEqual({
			tool: "grep",
			summary: false,
			totalMatches: 0,
			records: [],
		});
	});
});
