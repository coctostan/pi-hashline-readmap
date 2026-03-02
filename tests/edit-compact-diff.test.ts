import { describe, it, expect, beforeAll } from "vitest";
import { generateCompactOrFullDiff } from "../src/edit-diff";
import { ensureHashInit } from "../src/hashline";

describe("edit compact diffs", () => {
	beforeAll(async () => {
		await ensureHashInit();
	});

	it("single-line change produces compact format: LINE:HASH|old → LINE:HASH|new", () => {
		const oldContent = "line one\nline two\nline three";
		const newContent = "line one\nline TWO\nline three";
		const result = generateCompactOrFullDiff(oldContent, newContent);
		expect(result.diff).toMatch(/^\d+:[0-9a-f]{2}\|line two → \d+:[0-9a-f]{2}\|line TWO$/);
		expect(result.firstChangedLine).toBe(2);
	});

	it("single-line deletion produces compact format", () => {
		const oldContent = "line one\nline two\nline three";
		const newContent = "line one\nline three";
		const result = generateCompactOrFullDiff(oldContent, newContent);
		expect(result.diff).toMatch(/^\d+:[0-9a-f]{2}\|line two → \[deleted\]$/);
		expect(result.firstChangedLine).toBe(2);
	});

	it("set_line replacing content on one line uses compact format", () => {
		const oldContent = "aaa\nbbb\nccc";
		const newContent = "aaa\nBBB\nccc";
		const result = generateCompactOrFullDiff(oldContent, newContent);
		expect(result.diff).toMatch(/2:[0-9a-f]{2}\|bbb → 2:[0-9a-f]{2}\|BBB/);
	});

	it("multi-line change preserves full unified diff format", () => {
		const oldContent = "line one\nline two\nline three\nline four";
		const newContent = "line one\nLINE TWO\nLINE THREE\nline four";
		const result = generateCompactOrFullDiff(oldContent, newContent);
		expect(result.diff).toContain("+");
		expect(result.diff).toContain("-");
		expect(result.diff.split("\n").length).toBeGreaterThan(1);
	});

	it("replace_lines spanning multiple lines uses full unified diff", () => {
		const oldContent = "a\nb\nc\nd\ne";
		const newContent = "a\nX\nY\nZ\ne";
		const result = generateCompactOrFullDiff(oldContent, newContent);
		expect(result.diff).toContain("+");
		expect(result.diff).toContain("-");
	});

	it("identical content returns empty diff", () => {
		const content = "line one\nline two";
		const result = generateCompactOrFullDiff(content, content);
		expect(result.diff).toBe("");
		expect(result.firstChangedLine).toBeUndefined();
	});
});
