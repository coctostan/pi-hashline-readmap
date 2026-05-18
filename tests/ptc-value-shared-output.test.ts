import { describe, it, expect, beforeAll } from "vitest";
import * as ptc from "../src/ptc-value.js";

describe("ptc-value shared primitives", () => {
  beforeAll(async () => {
  });

  it("builds canonical line records and renders them from display-safe text", () => {
    expect(typeof (ptc as any).renderPtcLine).toBe("function");
    expect(typeof (ptc as any).renderPtcLines).toBe("function");

    const line = ptc.buildPtcLine(7, "hello\u0000world");
    expect(line).toEqual({
      line: 7,
      hash: line.hash,
      anchor: `7:${line.hash}`,
      raw: "hello\u0000world",
      display: "hello\\u0000world",
    });

    expect((ptc as any).renderPtcLine(line)).toBe(`${line.anchor}|hello\\u0000world`);
    expect((ptc as any).renderPtcLines([line])).toBe(`${line.anchor}|hello\\u0000world`);
  });

  it("builds a batch of canonical line records from a start line and raw strings", () => {
    const lines = ptc.buildPtcLines(5, ["alpha", "beta", "gamma"]);
    expect(lines).toHaveLength(3);
    expect(lines[0].line).toBe(5);
    expect(lines[0].raw).toBe("alpha");
    expect(lines[1].line).toBe(6);
    expect(lines[1].raw).toBe("beta");
    expect(lines[2].line).toBe(7);
    expect(lines[2].raw).toBe("gamma");
    // Each entry is a full PtcLine with anchor
    for (const l of lines) {
      expect(l.anchor).toBe(`${l.line}:${l.hash}`);
      expect(l.display).toBe(l.raw); // no control chars to escape
    }
  });

  it("builds canonical warnings, ranges, and grouped file payloads", () => {
    expect(typeof (ptc as any).buildPtcWarning).toBe("function");
    expect(typeof (ptc as any).buildPtcRange).toBe("function");
    expect(typeof (ptc as any).buildPtcFileGroup).toBe("function");

    const line = ptc.buildPtcLine(10, "const answer = 42;");

    expect((ptc as any).buildPtcWarning("binary-content", "[Warning: binary]")).toEqual({
      code: "binary-content",
      message: "[Warning: binary]",
    });

    expect((ptc as any).buildPtcRange(10, 12, 40)).toEqual({
      startLine: 10,
      endLine: 12,
      totalLines: 40,
    });

    expect(
      (ptc as any).buildPtcFileGroup(
        "/tmp/sample.ts",
        [(ptc as any).buildPtcRange(10, 12)],
        [line],
      ),
    ).toEqual({
      path: "/tmp/sample.ts",
      ranges: [{ startLine: 10, endLine: 12 }],
      lines: [line],
    });
  });

  it("builds canonical edit result payloads from shared edit semantics", () => {
    expect(typeof (ptc as any).buildPtcEditResult).toBe("function");

    expect(
      (ptc as any).buildPtcEditResult({
        path: "/tmp/sample.ts",
        summary: "Updated /tmp/sample.ts",
        diff: "-old\n+new",
        firstChangedLine: 2,
        warnings: [],
        noopEdits: [],
      }),
    ).toEqual({
      tool: "edit",
      ok: true,
      path: "/tmp/sample.ts",
      summary: "Updated /tmp/sample.ts",
      diff: "-old\n+new",
      firstChangedLine: 2,
      warnings: [],
      noopEdits: [],
    });
  });
});
