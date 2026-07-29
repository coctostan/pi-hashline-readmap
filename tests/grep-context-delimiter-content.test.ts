import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { computeLineHash } from "../src/hashline.js";
import { registerGrepTool } from "../src/grep.js";

function captureGrepTool(): any {
	let tool: any;
	registerGrepTool({ registerTool(def: any) { tool = def; } } as any);
	return tool;
}

describe("grep context path and content containing -digits-", () => {
	it("keeps context path, line, text, and hash on the same source line", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-grep-context-delimiter-"));
		const filePath = join(dir, "context-8- report.txt");
		const lines = [
			"line 1",
			"needle",
			"context payload -8- message",
			"line 4",
			"line 5",
			"line 6",
			"line 7",
			"wrong context target line 8",
		];
		writeFileSync(filePath, lines.join("\n"), "utf8");

		const result = await captureGrepTool().execute(
			"grep-context-repro",
			{ pattern: "needle", path: dir, literal: true, context: 1 },
			new AbortController().signal,
			() => {},
			{ cwd: process.cwd() },
		);

		expect(result.details.ptcValue.records).toEqual([
			{ path: filePath, line: 1, anchor: `1:${computeLineHash(1, lines[0])}`, kind: "context" },
			{ path: filePath, line: 2, anchor: `2:${computeLineHash(2, lines[1])}`, kind: "match" },
			{ path: filePath, line: 3, anchor: `3:${computeLineHash(3, lines[2])}`, kind: "context" },
		]);
		const text = result.content.find((item: any) => item.type === "text")?.text ?? "";
		expect(text).toContain(`${basename(filePath)}:  3:${computeLineHash(3, lines[2])}|${lines[2]}`);
		expect(text).not.toContain("(0 matches)");
	});
});
