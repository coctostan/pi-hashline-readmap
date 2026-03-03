import { describe, it, expect } from "vitest";
import {
	parseGrepIR,
	formatGrepOutput,
	type GrepIR,
} from "../src/grep";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { registerGrepTool } from "../src/grep.js";

describe("grep summary mode", () => {
	it("formatGrepOutput with summary: true returns header + per-file counts sorted descending", () => {
		const ir: GrepIR = {
			totalMatches: 7,
			files: [
				{
					path: "src/bar.ts",
					matchCount: 2,
					lines: [
						{ kind: "match", raw: "src/bar.ts:>>1:ab|hello" },
						{ kind: "match", raw: "src/bar.ts:>>3:cd|world" },
					],
				},
				{
					path: "src/foo.ts",
					matchCount: 5,
					lines: [
						{ kind: "match", raw: "src/foo.ts:>>1:ab|a" },
						{ kind: "match", raw: "src/foo.ts:>>2:ab|b" },
						{ kind: "match", raw: "src/foo.ts:>>3:ab|c" },
						{ kind: "match", raw: "src/foo.ts:>>4:ab|d" },
						{ kind: "match", raw: "src/foo.ts:>>5:ab|e" },
					],
				},
			],
		};
		const output = formatGrepOutput(ir, { summary: true });
		const lines = output.split("\n");
		// Header
		expect(lines[0]).toBe("[7 matches in 2 files]");
		// Sorted by match count descending
		expect(lines[1]).toBe("src/foo.ts: 5 matches");
		expect(lines[2]).toBe("src/bar.ts: 2 matches");
		// No hashline anchors anywhere
		expect(output).not.toContain(">>");
		expect(output).not.toMatch(/\d+:[0-9a-f]{2}\|/);
	});
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function callGrepToolSummary(params: {
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
	return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, {
		cwd: process.cwd(),
	});
}

function getTextContent(result: any): string {
	return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

describe("grep summary schema and integration", () => {
	it("registers a schema that includes the optional summary parameter", () => {
		let capturedTool: any = null;
		const mockPi = {
			registerTool(def: any) {
				capturedTool = def;
			},
		};
		registerGrepTool(mockPi as any);
		expect(capturedTool.parameters?.properties?.summary).toBeDefined();
	});

	it("summary: true via tool returns per-file counts, no hashlines", async () => {
		const filePath = resolve(fixturesDir, "small.ts");
		const result = await callGrepToolSummary({
			pattern: "export",
			path: filePath,
			summary: true,
		});
		const text = getTextContent(result);
		expect(text).toMatch(/^\[\d+ matches in \d+ files\]/);
		expect(text).toContain(`${filePath}: `);
		expect(text).not.toMatch(/\d+:[0-9a-f]{2}\|/);
	});
});
