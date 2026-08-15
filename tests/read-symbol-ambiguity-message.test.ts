import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("fs/promises", async () => {
	const actual = await vi.importActual<typeof import("fs/promises")>("fs/promises");
	return {
		...actual,
		access: vi.fn().mockResolvedValue(undefined),
		readFile: vi.fn().mockResolvedValue(Buffer.from("one\ntwo\nthree\nfour\nfive\n")),
		stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
	};
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("read symbol ambiguity message", () => {
	it("suggests @LINE disambiguation and does not suggest dot notation", async () => {
		const cacheModule = await import("../src/map-cache.js");
		vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
			path: "/tmp/sample.ts",
			totalLines: 5,
			totalBytes: 24,
			language: "typescript",
			symbols: [
				{ name: "add", kind: "function", startLine: 1, endLine: 2 },
				{ name: "add", kind: "function", startLine: 5, endLine: 5 },
			],
			imports: [],
			detailLevel: "full",
		} as any);

		const { registerReadTool } = await import("../src/read.js");
		let capturedTool: any = null;
		registerReadTool({ registerTool(def: any) { capturedTool = def; } } as any);

		const result = await capturedTool.execute(
			"test-call",
			{ path: "/tmp/sample.ts", symbol: "add", limit: 0 },
			new AbortController().signal,
			() => {},
			{ cwd: process.cwd() },
		);

		const text = result.content.find((c: any) => c.type === "text")?.text ?? "";
		expect(text).toContain("[Read params adjusted: ignored limit 0]");
		expect(text).toContain("add@1");
		expect(text).toContain("add@5");
		expect(text.toLowerCase()).not.toContain("dot notation");
		expect(result.details.ptcValue.warnings).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "params-adjusted" })]),
		);
	});

	it("exposes displayed and omitted ambiguity candidates", async () => {
		const cacheModule = await import("../src/map-cache.js");
		vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
			path: "/tmp/sample.ts",
			totalLines: 20,
			totalBytes: 200,
			language: "typescript",
			imports: [],
			detailLevel: "full",
			symbols: Array.from({ length: 8 }, (_, i) => ({
				name: `Worker${i + 1}`,
				kind: "class",
				startLine: i * 2 + 1,
				endLine: i * 2 + 2,
				children: [{
					name: "process",
					kind: "method",
					startLine: i * 2 + 1,
					endLine: i * 2 + 2,
				}],
			})),
		} as any);
		const { registerReadTool } = await import("../src/read.js");
		let tool: any;
		registerReadTool({ registerTool(value: any) { tool = value; } } as any);
		const result = await tool.execute(
			"ambiguity",
			{ path: "/tmp/sample.ts", symbol: "process" },
			new AbortController().signal,
			() => {},
			{ cwd: process.cwd() },
		);
		const ambiguity = result.details.ptcValue.ambiguity;
		expect(ambiguity).toMatchObject({ tier: "exact", totalCandidates: 8, omittedCount: 3 });
		expect(ambiguity.displayedCandidates).toHaveLength(5);
		expect(ambiguity.omittedCandidates).toMatchObject([
			{ parentName: "Worker6", startLine: 11 },
			{ parentName: "Worker7", startLine: 13 },
			{ parentName: "Worker8", startLine: 15 },
		]);
	});

	it("exposes overload recovery selectors", async () => {
		const cacheModule = await import("../src/map-cache.js");
		vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
			path: "/tmp/overloads.ts",
			totalLines: 20,
			totalBytes: 200,
			language: "typescript",
			imports: [],
			detailLevel: "full",
			symbols: [{
				name: "Worker",
				kind: "class",
				startLine: 1,
				endLine: 20,
				children: Array.from({ length: 8 }, (_, i) => ({
					name: "process",
					kind: "method",
					startLine: i * 2 + 1,
					endLine: i * 2 + 1,
				})),
			}],
		} as any);
		const { registerReadTool } = await import("../src/read.js");
		let tool: any = null;
		registerReadTool({ registerTool(value: any) { tool = value; } } as any);
		const result = await tool.execute(
			"overloads",
			{ path: "/tmp/overloads.ts", symbol: "process" },
			new AbortController().signal,
			() => {},
			{ cwd: process.cwd() },
		);
		expect(result.details.ptcValue.ambiguity.omittedSelectors).toEqual([
			"Worker.process or process@11",
			"Worker.process or process@13",
			"Worker.process or process@15",
		]);
	});
});
