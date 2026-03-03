import { describe, it, expect } from "vitest";
import { hasBareCarriageReturn } from "../src/edit-diff.js";

describe("Bug #024: bare CR detection", () => {
	describe("hasBareCarriageReturn()", () => {
		it("returns false for LF-only content", () => {
			expect(hasBareCarriageReturn("line1\nline2\nline3\n")).toBe(false);
		});
		it("returns false for CRLF-only content", () => {
			expect(hasBareCarriageReturn("line1\r\nline2\r\nline3\r\n")).toBe(false);
		});
		it("returns false for content with no line endings", () => {
			expect(hasBareCarriageReturn("single line")).toBe(false);
		});
		it("returns true for bare CR content (classic Mac)", () => {
			expect(hasBareCarriageReturn("Line 1\rLine 2\rLine 3\r")).toBe(true);
		});
		it("returns true for mixed LF + bare CR content", () => {
			expect(hasBareCarriageReturn("Line 1\nLine 2\rLine 3\n")).toBe(true);
		});
		it("returns false for mixed CRLF + LF (no bare CR)", () => {
			expect(hasBareCarriageReturn("Line 1\r\nLine 2\nLine 3\r\n")).toBe(false);
		});
	});
});
