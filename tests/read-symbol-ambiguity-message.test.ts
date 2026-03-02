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
			{ path: "/tmp/sample.ts", symbol: "add" },
			new AbortController().signal,
			() => {},
			{ cwd: process.cwd() },
		);

		const text = result.content.find((c: any) => c.type === "text")?.text ?? "";
		expect(text).toContain("add@1");
		expect(text).toContain("add@5");
		expect(text.toLowerCase()).not.toContain("dot notation");
	});
});
