import { describe, it, expect } from "vitest";
import { truncateDisplayLine } from "../src/ptc-value.js";

describe("issue 217 — truncateDisplayLine (display-only long-line guard)", () => {
  it("returns short display strings unchanged", () => {
    expect(truncateDisplayLine("short line")).toBe("short line");
  });

  it("returns a 500-char string unchanged (at the boundary)", () => {
    const exactly500 = "x".repeat(500);
    expect(truncateDisplayLine(exactly500)).toBe(exactly500);
  });

  it("truncates a >500-char string to 500 chars + marker with original length", () => {
    const long = "x".repeat(600);
    const out = truncateDisplayLine(long);
    expect(out).toBe("x".repeat(500) + "... [truncated, 600 chars total]");
  });

  it("reports the true original length in the marker for very long lines", () => {
    const long = "y".repeat(20000);
    const out = truncateDisplayLine(long);
    expect(out.startsWith("y".repeat(500))).toBe(true);
    expect(out.endsWith("... [truncated, 20000 chars total]")).toBe(true);
    expect(out.length).toBeLessThan(600);
  });
});
