import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { registerEditTool } from "../src/edit.js";
import { computeLineHash } from "../src/hashline.js";
import * as mapperModule from "../src/readmap/mapper.js";

function makeFakePi() {
	const tools: any[] = [];
	return { pi: { registerTool: (t: any) => tools.push(t) } as any, tools };
}

// Fixture content (6 lines including trailing newline):
// Line 1: export function add(a: number, b: number) {
// Line 2:   return a + b;
// Line 3: }
// Line 4: function bar() { return 1; }
// Line 5: function bar(n: number) { return n; }
// Line 6: (empty trailing newline)
const FIXTURE = [
	"export function add(a: number, b: number) {",
	"  return a + b;",
	"}",
	"function bar() { return 1; }",
	"function bar(n: number) { return n; }",
	"",
].join("\n");

describe("F2 — replace_symbol probe-pass error precedence", () => {
	afterEach(() => { vi.restoreAllMocks(); });

	it("AC 7: not-found replace_symbol error wins over anchor-overlap error", async () => {
		const dir = mkdtempSync(join(tmpdir(), "edit-f2-nf-"));
		const fp = join(dir, "x.ts");
		writeFileSync(fp, FIXTURE);

		const { pi, tools } = makeFakePi();
		registerEditTool(pi, { wasReadInSession: () => true });
		const tool = tools[0];

		// edits[0]: replace_symbol "nonexistent" → not-found in probe
		// edits[1]: replace_symbol "add"         → probe would succeed, add range [1,3]
		// edits[2]: set_line at line 2           → inside "add" range → would be AC 26 overlap
		//
		// Without F2: probe[0] skips, probe[1] adds range [1,3], AC 26 fires → overlap error
		// With F2:    probe[0] is not-found → return not-found immediately before AC 26
		const anchor2 = `2:${computeLineHash(2, "  return a + b;")}`;
		const res = await tool.execute(
			"c",
			{
				path: fp,
				edits: [
					{ replace_symbol: { symbol: "nonexistent", new_body: "export function nonexistent() {}" } },
					{ replace_symbol: { symbol: "add", new_body: "export function add(a: number, b: number) { return a + b + 1; }" } },
					{ set_line: { anchor: anchor2, new_text: "  return 0;" } },
				],
			},
			undefined,
			undefined,
			{ cwd: dir },
		);

		expect(res.isError).toBe(true);
		expect(res.details?.ptcValue?.error?.code).toBe("invalid-edit-variant");
		const msg: string = res.details?.ptcValue?.error?.message ?? res.content?.[0]?.text ?? "";
		expect(msg).toMatch(/symbol 'nonexistent' not found/i);
		expect(msg).not.toMatch(/inside.*replace_symbol/i);
		// No write occurred
		expect(readFileSync(fp, "utf-8")).toBe(FIXTURE);
	});

	it("AC 8: ambiguous replace_symbol error wins over anchor-overlap error", async () => {
		const dir = mkdtempSync(join(tmpdir(), "edit-f2-amb-"));
		const fp = join(dir, "x.ts");
		writeFileSync(fp, FIXTURE);

		const { pi, tools } = makeFakePi();
		registerEditTool(pi, { wasReadInSession: () => true });
		const tool = tools[0];

		// edits[0]: replace_symbol "bar" → ambiguous in probe
		// edits[1]: replace_symbol "add" → probe would succeed, add range [1,3]
		// edits[2]: set_line at line 2   → inside "add" range → would be AC 26 overlap
		//
		// Without F2: probe[0] skips, probe[1] adds range [1,3], AC 26 fires → overlap error
		// With F2:    probe[0] is ambiguous → return ambiguous immediately before AC 26
		const anchor2 = `2:${computeLineHash(2, "  return a + b;")}`;
		const res = await tool.execute(
			"c",
			{
				path: fp,
				edits: [
					{ replace_symbol: { symbol: "bar", new_body: "function bar() { return 0; }" } },
					{ replace_symbol: { symbol: "add", new_body: "export function add(a: number, b: number) { return a + b + 1; }" } },
					{ set_line: { anchor: anchor2, new_text: "  return 0;" } },
				],
			},
			undefined,
			undefined,
			{ cwd: dir },
		);

		expect(res.isError).toBe(true);
		expect(res.details?.ptcValue?.error?.code).toBe("invalid-edit-variant");
		const msg: string = res.details?.ptcValue?.error?.message ?? res.content?.[0]?.text ?? "";
		expect(msg).toMatch(/is ambiguous/i);
		expect(msg).not.toMatch(/inside.*replace_symbol/i);
		expect(readFileSync(fp, "utf-8")).toBe(FIXTURE);
	});

	it("AC 5b: generateMapFromContent called exactly once for a single replace_symbol batch", async () => {
		const dir = mkdtempSync(join(tmpdir(), "edit-spy-"));
		const fp = join(dir, "x.ts");
		writeFileSync(fp, `export function add() { return 1; }\n`);

		const spy = vi.spyOn(mapperModule, "generateMapFromContent");

		const { pi, tools } = makeFakePi();
		registerEditTool(pi, { wasReadInSession: () => true });
		const tool = tools[0];

		await tool.execute(
			"c",
			{
				path: fp,
				edits: [{ replace_symbol: { symbol: "add", new_body: "export function add() { return 2; }" } }],
			},
			undefined,
			undefined,
			{ cwd: dir },
		);

		// Probe result reused in apply pass → exactly one generateMapFromContent call.
		expect(spy).toHaveBeenCalledTimes(1);
	});


	it("AC 4: generateMapFromContent called once per replace_symbol edit in a multi-symbol batch", async () => {
		const dir = mkdtempSync(join(tmpdir(), "edit-multi-spy-"));
		const fp = join(dir, "x.ts");
		writeFileSync(fp, [
			"export function add() { return 1; }",
			"export function sub() { return 3; }",
			"",
		].join("\n"));

		const spy = vi.spyOn(mapperModule, "generateMapFromContent");

		const { pi, tools } = makeFakePi();
		registerEditTool(pi, { wasReadInSession: () => true });
		const tool = tools[0];

		await tool.execute(
			"c",
			{
				path: fp,
				edits: [
					{ replace_symbol: { symbol: "add", new_body: "export function add() { return 2; }" } },
					{ replace_symbol: { symbol: "sub", new_body: "export function sub() { return 4; }" } },
				],
			},
			undefined,
			undefined,
			{ cwd: dir },
		);

		// Probe results reused in apply pass → exactly one generateMapFromContent call per replace_symbol edit.
		expect(spy).toHaveBeenCalledTimes(2);
		expect(readFileSync(fp, "utf-8")).toBe([
			"export function add() { return 2; }",
			"export function sub() { return 4; }",
			"",
		].join("\n"));
	});


	it("rejects duplicate replace_symbol ranges before applying any replacement", async () => {
		const dir = mkdtempSync(join(tmpdir(), "edit-rs-overlap-"));
		const fp = join(dir, "x.ts");
		writeFileSync(fp, [
			"export function add() {",
			"  return 1;",
			"}",
			"",
		].join("\n"));

		const { pi, tools } = makeFakePi();
		registerEditTool(pi, { wasReadInSession: () => true });
		const tool = tools[0];

		const res = await tool.execute(
			"c",
			{
				path: fp,
				edits: [
					{ replace_symbol: { symbol: "add", new_body: "export function add() {\n  return 2;\n}" } },
					{ replace_symbol: { symbol: "add", new_body: "export function add() {\n  return 3;\n}" } },
				],
			},
			undefined,
			undefined,
			{ cwd: dir },
		);

		expect(res.isError).toBe(true);
		expect(res.details?.ptcValue?.error?.code).toBe("invalid-edit-variant");
		expect(res.details?.ptcValue?.error?.message ?? "").toMatch(/overlap|duplicate/i);
		expect(readFileSync(fp, "utf-8")).toBe([
			"export function add() {",
			"  return 1;",
			"}",
			"",
		].join("\n"));
	});


	it("rejects replace_lines ranges that fully span a replace_symbol range", async () => {
		const dir = mkdtempSync(join(tmpdir(), "edit-rs-span-"));
		const fp = join(dir, "x.ts");
		const content = [
			"const before = 0;",
			"export function add() {",
			"  return 1;",
			"}",
			"const after = 0;",
			"",
		].join("\n");
		writeFileSync(fp, content);

		const { pi, tools } = makeFakePi();
		registerEditTool(pi, { wasReadInSession: () => true });
		const tool = tools[0];

		const res = await tool.execute(
			"c",
			{
				path: fp,
				edits: [
					{ replace_symbol: { symbol: "add", new_body: "export function add() {\n  return 2;\n}" } },
					{ replace_lines: {
						start_anchor: `1:${computeLineHash(1, "const before = 0;")}`,
						end_anchor: `5:${computeLineHash(5, "const after = 0;")}`,
						new_text: "const overwritten = true;",
					} },
				],
			},
			undefined,
			undefined,
			{ cwd: dir },
		);

		expect(res.isError).toBe(true);
		expect(res.details?.ptcValue?.error?.code).toBe("invalid-edit-variant");
		expect(res.details?.ptcValue?.error?.message ?? "").toMatch(/overlap|inside|replace_symbol/i);
		expect(readFileSync(fp, "utf-8")).toBe(content);
	});
});
