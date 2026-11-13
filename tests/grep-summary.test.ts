import { describe, it, expect } from "vitest";
import { buildGrepOutput } from "../src/grep-output.js";
import { resolve, dirname, relative } from "path";
import { fileURLToPath } from "url";
import { registerGrepTool } from "../src/grep.js";

describe("grep summary mode", () => {
	it("buildGrepOutput with summary: true returns header + per-file counts sorted descending", () => {
		const group = (displayPath: string, matchCount: number) => ({ displayPath, absolutePath: `/repo/${displayPath}`, matchCount, entries: [] });
		const output = buildGrepOutput({
			summary: true,
			totalMatches: 7,
			native: { limitReached: false, truncated: false, linesTruncated: false },
			groups: [group("src/bar.ts", 2), group("src/foo.ts", 5)],
			records: [],
		});
		expect(output.text).toBe("[7 matches in 2 files]\nsrc/foo.ts: 5 matches\nsrc/bar.ts: 2 matches");
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
		expect(text).toContain(`${relative(process.cwd(), filePath)}: `);
		expect(text).not.toMatch(/\d+:[0-9a-f]{3}\|/);
	});
});
