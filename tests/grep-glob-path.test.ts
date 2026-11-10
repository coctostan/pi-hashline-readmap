import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeLineHash } from "../src/hashline.js";
import { registerGrepTool } from "../src/grep.js";

function captureGrepTool(): any {
	let tool: any;
	registerGrepTool({ registerTool(def: any) { tool = def; } } as any);
	return tool;
}

// Since Pi 1.5.1 the host's grep matches `glob` relative to `path`; Pi 1.5.0 matched it from the cwd and found nothing here.
describe("grep glob beside path", () => {
	it("matches the glob relative to path and names each file from the cwd", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "pi-grep-glob-path-"));
		try {
			const put = (rel: string) => {
				const file = join(cwd, rel);
				mkdirSync(join(file, ".."), { recursive: true });
				writeFileSync(file, "const needle = 1;\n", "utf8");
			};
			put("repo/sub/deep/x.ts");
			put("repo/sub/deep/y.js");
			put("repo/other/z.ts");
			const result = await captureGrepTool().execute(
				"grep-glob-path", { pattern: "needle", path: "repo", glob: "sub/**/*.ts", literal: true },
				new AbortController().signal, () => {}, { cwd },
			);

			const text = result.content.find((item: any) => item.type === "text")?.text ?? "";
			expect(text.split("\n")).toEqual([
				"[1 matches in 1 files]",
				"--- repo/sub/deep/x.ts (1 matches) ---",
				`repo/sub/deep/x.ts:>>1:${computeLineHash(1, "const needle = 1;")}|const needle = 1;`,
			]);
			expect(result.details.ptcValue.records.map((record: any) => record.path)).toEqual([join(cwd, "repo/sub/deep/x.ts")]);
		} finally { rmSync(cwd, { recursive: true, force: true }); }
	});
});
