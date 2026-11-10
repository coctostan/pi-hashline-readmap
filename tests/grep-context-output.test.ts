import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeLineHash } from "../src/hashline.js";
import { registerGrepTool } from "../src/grep.js";

function captureGrepTool(): any {
	let tool: any;
	registerGrepTool({ registerTool(def: any) { tool = def; } } as any);
	return tool;
}

// Pins grep's context output across host moves: the host's grep printed context differently on Pi 1.5.0 and 1.5.2.
// On Pi 1.5.2 the host prints each line once, matches over context, in ascending order; only the `--` at a gap is ours.
describe("grep context output", () => {
	it("prints overlapping windows once, in order, with anchors and a separator at each gap", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-grep-context-output-"));
		try {
			// Windows 1-3 and 3-5 overlap at line 3, line 5 is empty, lines 6-7 are a gap, and match 10 sits in match 9's window.
			const lines = ["alpha", "needle one", "middle", "needle two", "", "gap", "gap", "gap", "needle three", "needle four", "tail"];
			const filePath = join(dir, "sample.txt");
			writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
			const result = await captureGrepTool().execute(
				"grep-context-output", { pattern: "needle", path: dir, literal: true, context: 1 },
				new AbortController().signal, () => {}, { cwd: dir },
			);

			const shown: Array<[number, "match" | "context"]> = [
				[1, "context"], [2, "match"], [3, "context"], [4, "match"], [5, "context"],
				[8, "context"], [9, "match"], [10, "match"], [11, "context"],
			];
			const anchor = (line: number) => `${line}:${computeLineHash(line, lines[line - 1])}`;
			const rendered = (line: number, kind: string) => `sample.txt:${kind === "match" ? ">>" : "  "}${anchor(line)}|${lines[line - 1]}`;
			const text = result.content.find((item: any) => item.type === "text")?.text ?? "";
			expect(text.split("\n")).toEqual([
				"[4 matches in 1 files]",
				"--- sample.txt (4 matches) ---",
				...shown.slice(0, 5).map(([line, kind]) => rendered(line, kind)),
				"--",
				...shown.slice(5).map(([line, kind]) => rendered(line, kind)),
			]);
			expect(result.details.ptcValue.records).toEqual(
				shown.map(([line, kind]) => ({ path: filePath, line, anchor: anchor(line), kind })),
			);
		} finally { rmSync(dir, { recursive: true, force: true }); }
	});
});
