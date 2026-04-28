import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerGrepTool } from "../src/grep.js";

function getText(result: any): string {
	return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

async function callGrep(params: {
	pattern: string;
	path: string;
	literal?: boolean;
	limit?: number;
}) {
	let capturedTool: any = null;
	registerGrepTool({ registerTool(def: any) { capturedTool = def; } } as any);
	if (!capturedTool) throw new Error("grep tool was not registered");
	return capturedTool.execute(
		"test-call",
		params,
		new AbortController().signal,
		() => {},
		{ cwd: process.cwd() },
	);
}

function makeFixture(): string {
	// 12 files, 10 matching lines each → 120 matches. Each line is ~80 bytes.
	// Sized below default budgets (2000 lines / 50 KiB) so truncation can only
	// fire via the env knob.
	const dir = mkdtempSync(join(tmpdir(), "pi-grep-budget-env-"));
	const line = "needle " + "x".repeat(60);
	for (let i = 0; i < 12; i++) {
		const filePath = join(dir, `file-${String(i + 1).padStart(2, "0")}.txt`);
		writeFileSync(filePath, Array.from({ length: 10 }, () => line).join("\n"), "utf8");
	}
	return dir;
}

describe("grep output budget env vars", () => {
	const SAVED: { lines: string | undefined; bytes: string | undefined } = {
		lines: process.env.PI_HASHLINE_GREP_MAX_LINES,
		bytes: process.env.PI_HASHLINE_GREP_MAX_BYTES,
	};

	beforeEach(() => {
		delete process.env.PI_HASHLINE_GREP_MAX_LINES;
		delete process.env.PI_HASHLINE_GREP_MAX_BYTES;
	});

	afterEach(() => {
		if (SAVED.lines === undefined) delete process.env.PI_HASHLINE_GREP_MAX_LINES;
		else process.env.PI_HASHLINE_GREP_MAX_LINES = SAVED.lines;
		if (SAVED.bytes === undefined) delete process.env.PI_HASHLINE_GREP_MAX_BYTES;
		else process.env.PI_HASHLINE_GREP_MAX_BYTES = SAVED.bytes;
	});

	it("does not truncate small fixture by default", async () => {
		const dir = makeFixture();
		const result = await callGrep({ pattern: "needle", path: dir, literal: true, limit: 200 });
		const text = getText(result);
		expect(text).not.toContain("[Output truncated:");
	});

	it("truncates earlier when PI_HASHLINE_GREP_MAX_LINES is small", async () => {
		const dir = makeFixture();
		process.env.PI_HASHLINE_GREP_MAX_LINES = "10";
		const result = await callGrep({ pattern: "needle", path: dir, literal: true, limit: 200 });
		const text = getText(result);
		expect(text).toContain("[Output truncated:");
		expect(text).toContain("Refine pattern or increase limit.]");
	});

	it("truncates earlier when PI_HASHLINE_GREP_MAX_BYTES is small", async () => {
		const dir = makeFixture();
		process.env.PI_HASHLINE_GREP_MAX_BYTES = "1024";
		const result = await callGrep({ pattern: "needle", path: dir, literal: true, limit: 200 });
		const text = getText(result);
		expect(text).toContain("[Output truncated:");
	});

	it.each(["abc", "-5", "0", "3.14", "", "0x10", "1e3", "1,000", "+5"])(
		"falls back to defaults for invalid value %j",
		async (raw) => {
			const dir = makeFixture();
			process.env.PI_HASHLINE_GREP_MAX_LINES = raw;
			process.env.PI_HASHLINE_GREP_MAX_BYTES = raw;
			const result = await callGrep({ pattern: "needle", path: dir, literal: true, limit: 200 });
			const text = getText(result);
			expect(text).not.toContain("[Output truncated:");
		},
	);

	it("clamps above-default lines/bytes to defaults (no expansion)", async () => {
		const dir = makeFixture();
		process.env.PI_HASHLINE_GREP_MAX_LINES = "99999";
		process.env.PI_HASHLINE_GREP_MAX_BYTES = "104857600"; // 100 MiB
		const result = await callGrep({ pattern: "needle", path: dir, literal: true, limit: 200 });
		const text = getText(result);
		// Same as "no env" baseline on this fixture: not truncated.
		expect(text).not.toContain("[Output truncated:");
	});

	it("accepts whitespace-padded values", async () => {
		const dir = makeFixture();
		process.env.PI_HASHLINE_GREP_MAX_LINES = " 10 ";
		const result = await callGrep({ pattern: "needle", path: dir, literal: true, limit: 200 });
		const text = getText(result);
		expect(text).toContain("[Output truncated:");
	});

	it("treats the two env vars independently when only lines is set", async () => {
		const dir = makeFixture();
		process.env.PI_HASHLINE_GREP_MAX_LINES = "10";
		// bytes left unset
		const result = await callGrep({ pattern: "needle", path: dir, literal: true, limit: 200 });
		const text = getText(result);
		expect(text).toContain("[Output truncated:");
	});
});
