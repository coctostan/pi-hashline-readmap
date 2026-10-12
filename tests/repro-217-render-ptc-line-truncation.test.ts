import { describe, it, expect, beforeAll } from "vitest";
import { ensureHashInit } from "../src/hashline.js";
import { buildPtcLine, renderPtcLine, renderPtcLines } from "../src/ptc-value.js";
import { buildReadOutput } from "../src/read-output.js";

const marker = (line: number, total: number) =>
  `... [truncated, ${total} chars total; read({offset:${line}, charOffset:500})]`;

describe("issue 217 — renderPtcLine caps long display lines", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("renders short lines unchanged with full anchor + content", () => {
    const line = buildPtcLine(3, "const x = 1;");
    expect(renderPtcLine(line)).toBe(`${line.anchor}|const x = 1;`);
  });

  it("truncates a >500-char line, keeps the full anchor, and tells the agent how to fetch the rest", () => {
    const longRaw = "needle " + "x".repeat(20000);
    const line = buildPtcLine(1, longRaw);
    const rendered = renderPtcLine(line);
    expect(rendered.startsWith(`${line.anchor}|`)).toBe(true);
    const displayed = rendered.slice(`${line.anchor}|`.length);
    expect(displayed.length).toBeLessThan(600);
    expect(displayed.endsWith(marker(1, longRaw.length))).toBe(true);
    expect(line.raw).toBe(longRaw);
  });

  it("renderPtcLines applies the cap per line using each line's own number", () => {
    const a = buildPtcLine(1, "short");
    const b = buildPtcLine(2, "z".repeat(700));
    const out = renderPtcLines([a, b]).split("\n");
    expect(out[0]).toBe(`${a.anchor}|short`);
    expect(out[1].endsWith(marker(2, 700))).toBe(true);
  });

  it("adds the hint to clipped local-bundle support lines at their own line numbers", () => {
    const out = buildReadOutput({
      path: "/tmp/f.ts",
      startLine: 1,
      endLine: 1,
      totalLines: 9,
      selectedLines: ["target"],
      bundle: {
        mode: "local",
        applied: true,
        localSupport: [
          { symbol: { query: "helper", name: "helper", kind: "function", startLine: 7, endLine: 7 }, lines: ["s".repeat(700)] },
        ],
      },
    });
    expect(out.text).toContain(marker(7, 700));
  });
});
