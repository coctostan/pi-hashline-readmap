import { describe, it, expect } from "vitest";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { registerGrepTool } from "../src/grep.js";
import {
	formatGrepOutput,
	type GrepIR,
	type GrepIRLine,
} from "../src/grep";

describe("grep truncation indicator", () => {
	it("appends truncation message when result count equals limit", () => {
		const lines: GrepIRLine[] = Array.from({ length: 5 }, (_, i) => ({
			kind: "match" as const,
			raw: `src/foo.ts:>>${i + 1}:ab|line ${i}`,
		}));
		const ir: GrepIR = {
			totalMatches: 5,
			files: [{ path: "src/foo.ts", matchCount: 5, lines }],
		};
		const output = formatGrepOutput(ir, { limit: 5 });
		expect(output).toContain("[Results truncated at 5 matches — refine pattern or increase limit]");
	});

	it("does not append truncation message when results are under limit", () => {
		const lines: GrepIRLine[] = Array.from({ length: 3 }, (_, i) => ({
			kind: "match" as const,
			raw: `src/foo.ts:>>${i + 1}:ab|line ${i}`,
		}));
		const ir: GrepIR = {
			totalMatches: 3,
			files: [{ path: "src/foo.ts", matchCount: 3, lines }],
		};
		const output = formatGrepOutput(ir, { limit: 5 });
		expect(output).not.toContain("[Results truncated");
	});

	it("does not append truncation message when no limit is specified and results < 100", () => {
		const lines: GrepIRLine[] = Array.from({ length: 3 }, (_, i) => ({
			kind: "match" as const,
			raw: `src/foo.ts:>>${i + 1}:ab|line ${i}`,
		}));
		const ir: GrepIR = {
			totalMatches: 3,
			files: [{ path: "src/foo.ts", matchCount: 3, lines }],
		};
		const output = formatGrepOutput(ir);
		expect(output).not.toContain("[Results truncated");
	});

	it("appends truncation message at default limit of 100", () => {
		const lines: GrepIRLine[] = Array.from({ length: 100 }, (_, i) => ({
			kind: "match" as const,
			raw: `src/foo.ts:>>${i + 1}:ab|line ${i}`,
		}));
		const ir: GrepIR = {
			totalMatches: 100,
			files: [{ path: "src/foo.ts", matchCount: 100, lines }],
		};
		// No limit option passed — should use default of 100
		const output = formatGrepOutput(ir, { limit: 100 });
		expect(output).toContain("[Results truncated at 100 matches — refine pattern or increase limit]");
	});

	it("appends truncation message in summary mode when results hit limit", () => {
		const lines: GrepIRLine[] = Array.from({ length: 5 }, (_, i) => ({
			kind: "match" as const,
			raw: `src/foo.ts:>>${i + 1}:ab|line ${i}`,
		}));
		const ir: GrepIR = {
			totalMatches: 5,
			files: [{ path: "src/foo.ts", matchCount: 5, lines }],
		};
		const output = formatGrepOutput(ir, { summary: true, limit: 5 });
		// Summary header and per-file count appear
		expect(output).toContain("[5 matches in 1 files]");
		expect(output).toContain("src/foo.ts: 5 matches");
		// Truncation indicator also appears
		expect(output).toContain("[Results truncated at 5 matches — refine pattern or increase limit]");
		// No hashline anchors in summary mode
		expect(output).not.toMatch(/\d+:[0-9a-f]{2}\|/);
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
		expect(text).toContain("[Results truncated at 2 matches — refine pattern or increase limit]");
	});
});