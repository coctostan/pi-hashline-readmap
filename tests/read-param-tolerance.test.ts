import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMapCache } from "../src/map-cache.js";

const delegatedRead = vi.hoisted(() => {
	const result = {
		content: [
			{ type: "text", text: "Read image file [image/png]" },
			{ type: "image", data: "mock-image", mimeType: "image/png" },
		],
		details: { delegated: true },
	};
	return { result, execute: vi.fn(async (..._args: any[]) => result) };
});

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
	return {
		...actual,
		createReadTool: () => ({ execute: delegatedRead.execute }),
	};
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");
const smallFixture = resolve(fixturesDir, "small.ts");
const pngData = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lBBkGQAAAABJRU5ErkJggg==",
	"base64",
);
const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

async function executeReadTool(params: Record<string, unknown>) {
	const { registerReadTool } = await import("../src/read.js");
	let capturedTool: any = null;
	registerReadTool({ registerTool(def: any) { capturedTool = def; } } as any);
	if (!capturedTool) throw new Error("read tool was not registered");
	const result = await capturedTool.execute(
		"test-call",
		params,
		new AbortController().signal,
		() => {},
		{ cwd: process.cwd() },
	);
	return { result, tool: capturedTool };
}

async function callReadTool(params: Record<string, unknown>) {
	return (await executeReadTool(params)).result;
}

function getTextContent(result: any): string {
	return result.content.find((item: any) => item.type === "text")?.text ?? "";
}

function getRenderedText(component: any, width = 80): string {
	return component?.text ?? component?.render?.(width)?.join("\n") ?? "";
}

function expectAdjustment(result: any, ...fragments: string[]) {
	const text = getTextContent(result);
	expect(text).toContain("[Read params adjusted:");
	for (const fragment of fragments) expect(text).toContain(fragment);
	expect(result.details?.ptcValue?.warnings).toEqual(
		expect.arrayContaining([expect.objectContaining({ code: "params-adjusted" })]),
	);
}

describe("read param tolerance — placeholder-only recovery", () => {
	beforeEach(() => {
		clearMapCache();
		delegatedRead.execute.mockClear();
	});

	it("preserves a symbol read when zero offset and limit placeholders are omitted", async () => {
		const result = await callReadTool({
			path: smallFixture,
			symbol: "UserDirectory",
			offset: 0,
			limit: 0,
			bundle: "local",
		});
		const text = getTextContent(result);

		expect(result.isError).not.toBe(true);
		expectAdjustment(result, "ignored offset 0", "ignored limit 0");
		expect(text).toContain("[Symbol: UserDirectory");
		expect(result.details.ptcValue.symbol).toMatchObject({ name: "UserDirectory" });
		expect(result.details.ptcValue.bundle).toMatchObject({ mode: "local", applied: true });
	});

	it("treats numeric and string zero range placeholders as omitted", async () => {
		for (const value of [0, "0"]) {
			const result = await callReadTool({ path: smallFixture, offset: value, limit: value });
			expect(result.isError).not.toBe(true);
			expectAdjustment(result, "ignored offset 0", "ignored limit 0");
			expect(getTextContent(result)).toMatch(/^1:[0-9a-f]{3}\|/m);
		}
	});

	it("ignores empty-string numeric placeholders before choosing range mode", async () => {
		const result = await callReadTool({ path: smallFixture, offset: "", limit: "" });

		expect(result.isError).not.toBe(true);
		expectAdjustment(result, "ignored empty offset", "ignored empty limit");
		expect(getTextContent(result)).toMatch(/^1:[0-9a-f]{3}\|/m);
	});

	it("treats an empty symbol as omitted while retaining a meaningful range", async () => {
		const result = await callReadTool({ path: smallFixture, offset: 3, limit: 4, symbol: "" });
		const text = getTextContent(result);

		expect(result.isError).not.toBe(true);
		expectAdjustment(result, "ignored empty symbol");
		expect(text).toMatch(/^3:[0-9a-f]{3}\|/m);
		expect(text).toMatch(/^6:[0-9a-f]{3}\|/m);
		expect(text).not.toMatch(/^7:[0-9a-f]{3}\|/m);
	});

	it("still rejects a positive offset combined with a non-empty symbol", async () => {
		const result = await callReadTool({
			path: smallFixture,
			offset: 3,
			limit: 0,
			symbol: "UserDirectory",
		});

		expect(result.isError).toBe(true);
		expect(result.details.ptcValue.error.code).toBe("invalid-params-combo");
		expect(getTextContent(result)).toContain("Cannot combine symbol with offset");
		expectAdjustment(result, "ignored limit 0");
	});

	it("does not hide a bundle-without-symbol error after omitting an empty symbol", async () => {
		const result = await callReadTool({ path: smallFixture, symbol: "", bundle: "local" });

		expect(result.isError).toBe(true);
		expect(result.details.ptcValue.error.code).toBe("invalid-params-combo");
		expect(getTextContent(result)).toContain("Cannot use bundle without symbol");
		expectAdjustment(result, "ignored empty symbol");
	});

	it("keeps the underlying validation error visible in collapsed rendering", async () => {
		const { result, tool } = await executeReadTool({
			path: "package.json",
			offset: "",
			limit: -1,
		});
		const modelText = getTextContent(result);

		expect(result.isError).toBe(true);
		expect(modelText).toContain("[Read params adjusted: ignored empty offset]");
		expect(modelText).toContain("Invalid limit: expected a positive integer, received -1.");

		const collapsed = getRenderedText(tool.renderResult(result, {}, theme, {}));
		expect(collapsed).toContain("Invalid limit: expected a positive integer, received -1.");
		expect(collapsed).not.toContain("[Read params adjusted:");

		const expanded = getRenderedText(
			tool.renderResult(result, { expanded: true }, theme, { expanded: true }),
		);
		expect(expanded).toContain("[Read params adjusted: ignored empty offset]");
		expect(expanded).toContain("Invalid limit: expected a positive integer, received -1.");
	});

	it("does not mistake a non-string symbol for an empty placeholder", async () => {
		const result = await callReadTool({ path: smallFixture, symbol: 42 });

		expect(result.isError).toBe(true);
		expect(result.details.ptcValue.error.code).toBe("invalid-params-combo");
		expect(getTextContent(result)).toBe("Invalid symbol: expected a non-empty string.");
		expect(result.details.ptcValue.warnings).toBeUndefined();
	});

	it.each(["screenshot.png", "screenshot"])(
		"preserves the adjustment notice and attachment for delegated image %s",
		async (fileName) => {
			const tempDir = mkdtempSync(resolve(tmpdir(), "hashline-read-adjusted-image-"));
			try {
				const imagePath = resolve(tempDir, fileName);
				writeFileSync(imagePath, pngData);
				const { result, tool } = await executeReadTool({ path: imagePath, offset: 0, limit: "" });

				expect(result.isError).not.toBe(true);
				expect(delegatedRead.execute).toHaveBeenCalledTimes(1);
				expect(delegatedRead.execute.mock.calls[0]?.[1]).toMatchObject({
					path: imagePath,
					offset: undefined,
					limit: undefined,
				});
				expectAdjustment(result, "ignored offset 0", "ignored empty limit");
				expect(getTextContent(result)).toContain("Read image file [image/png]");
				expect(result.content.find((item: any) => item.type === "image")).toBe(
					delegatedRead.result.content[1],
				);
				expect(result.details.delegated).toBe(true);
				const rendered = getRenderedText(tool.renderResult(result, {}, theme, {}));
				expect(rendered).toContain("loaded");
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		},
	);

	it("returns a clean delegated result by identity", async () => {
		const tempDir = mkdtempSync(resolve(tmpdir(), "hashline-read-clean-image-"));
		try {
			const imagePath = resolve(tempDir, "screenshot.png");
			writeFileSync(imagePath, pngData);

			const result = await callReadTool({ path: imagePath });

			expect(result).toBe(delegatedRead.result);
			expect(delegatedRead.execute).toHaveBeenCalledTimes(1);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("emits no adjustment notice for a clean call", async () => {
		const result = await callReadTool({ path: smallFixture, symbol: "UserDirectory", limit: 2 });

		expect(result.isError).not.toBe(true);
		expect(getTextContent(result)).not.toContain("[Read params adjusted:");
		expect(result.details.ptcValue.warnings).not.toEqual(
			expect.arrayContaining([expect.objectContaining({ code: "params-adjusted" })]),
		);
	});
});
