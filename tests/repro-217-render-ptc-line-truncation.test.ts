import { describe, it, expect, beforeAll } from "vitest";
import { ensureHashInit } from "../src/hashline.js";
import { buildPtcLine, renderPtcLine, renderPtcLines } from "../src/ptc-value.js";

describe("issue 217 — renderPtcLine caps long display lines", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("renders short lines unchanged with full anchor + content", () => {
    const line = buildPtcLine(3, "const x = 1;");
    expect(renderPtcLine(line)).toBe(`${line.anchor}|const x = 1;`);
  });

  it("truncates the displayed content of a >500-char line but keeps the full anchor", () => {
    const longRaw = "needle " + "x".repeat(20000);
    const line = buildPtcLine(1, longRaw);
    const rendered = renderPtcLine(line);
    // Anchor (line:hash) is preserved and derived from the FULL raw content.
    expect(rendered.startsWith(`${line.anchor}|`)).toBe(true);
    // Displayed content is capped, not the full 20k chars.
    const displayed = rendered.slice(`${line.anchor}|`.length);
    expect(displayed.length).toBeLessThan(600);
    expect(displayed.endsWith(`... [truncated, ${longRaw.length} chars total]`)).toBe(true);
    // The stored raw is untouched — edits still operate on full content.
    expect(line.raw).toBe(longRaw);
  });

  it("renderPtcLines applies the cap per line", () => {
    const a = buildPtcLine(1, "short");
    const b = buildPtcLine(2, "z".repeat(700));
    const out = renderPtcLines([a, b]).split("\n");
    expect(out[0]).toBe(`${a.anchor}|short`);
    expect(out[1].endsWith("... [truncated, 700 chars total]")).toBe(true);
  });
});
