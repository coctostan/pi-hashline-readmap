import { describe, it, expect } from "vitest";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { registerGrepTool } from "../src/grep.js";
import { buildGrepOutput } from "../src/grep-output.js";

describe("grep truncation indicator", () => {
	it("appends truncation message in summary mode when results hit limit", () => {
		const output = buildGrepOutput({
			summary: true,
			totalMatches: 5,
			groups: [{ displayPath: "src/foo.ts", absolutePath: "/repo/src/foo.ts", matchCount: 5, entries: [] }],
			limit: 5,
			native: { limitReached: true, truncated: false, linesTruncated: false },
			records: [],
		});
		expect(output.text).toBe([
			"[5 matches in 1 files]",
			"src/foo.ts: 5 matches",
			"",
			"[Search stopped at 5 matches; completeness unknown — refine pattern or increase limit]",
		].join("\n"));
	});
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");
async function callGrepToolTruncation(params: {
	pattern: string;
	path?: string;
	glob?: string;
	ignoreCase?: boolean;
	literal?: boolean;
	limit?: number;
	summary?: boolean;
}) {
	let capturedTool: any = null;
	const mockPi = {
		registerTool(def: any) {
			capturedTool = def;
		},
	};
	registerGrepTool(mockPi as any);
	return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getTextContentT(result: any): string {
	return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

describe("grep truncation indicator integration", () => {
	it("truncation indicator appears when tool results hit limit", async () => {
		// pattern "e" produces 34 matches in small.ts; limit=2 ensures totalMatches === 2 === limit
		const result = await callGrepToolTruncation({
			pattern: "e",
			path: resolve(fixturesDir, "small.ts"),
			limit: 2,
		});
		const text = getTextContentT(result);
		expect(text).toContain("[Search stopped at 2 matches; completeness unknown — refine pattern or increase limit]");
	});
});