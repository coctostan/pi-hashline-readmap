import { beforeAll, describe, it, expect } from "vitest";
import {
  parseGrepIR,
  truncateGrepIR,
  separateContextGroups,
  type GrepIR,
  type GrepIRLine,
} from "../src/grep";
import { buildGrepOutput, type GrepOutputGroup } from "../src/grep-output.js";
import { ensureHashInit } from "../src/hashline.js";
import { buildPtcLine } from "../src/ptc-value.js";

function matchGroup(displayPath: string, lineNumbers: number[]): GrepOutputGroup {
  return {
    displayPath,
    absolutePath: `/repo/${displayPath}`,
    matchCount: lineNumbers.length,
    entries: lineNumbers.map((n) => ({ kind: "match" as const, line: buildPtcLine(n, `line ${n}`) })),
  };
}

describe("grep context reduction", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("formats zero matches as [0 matches in 0 files]", () => {
    const output = buildGrepOutput({ summary: false, totalMatches: 0, groups: [], records: [] });
    expect(output.text).toBe("[0 matches in 0 files]");
  });

  it("prepends summary header [N matches in M files] over per-file sections", () => {
    const output = buildGrepOutput({
      summary: false,
      totalMatches: 3,
      groups: [matchGroup("src/foo.ts", [1, 5]), matchGroup("src/bar.ts", [3])],
      records: [],
    });
    const anchor = (n: number) => buildPtcLine(n, `line ${n}`).anchor;
    expect(output.text).toBe([
      "[3 matches in 2 files]",
      "--- src/foo.ts (2 matches) ---",
      `src/foo.ts:>>${anchor(1)}|line 1`,
      `src/foo.ts:>>${anchor(5)}|line 5`,
      "--- src/bar.ts (1 matches) ---",
      `src/bar.ts:>>${anchor(3)}|line 3`,
    ].join("\n"));
  });

  it("parseGrepIR correctly counts matches and groups by file", () => {
    const lines = [
      "src/foo.ts:>>1:ab|hello",
      "src/foo.ts:>>5:cd|world",
      "src/bar.ts:>>3:ef|baz",
    ];
    const ir = parseGrepIR(lines);
    expect(ir.totalMatches).toBe(3);
    expect(ir.files).toHaveLength(2);
    expect(ir.files[0].path).toBe("src/foo.ts");
    expect(ir.files[0].matchCount).toBe(2);
    expect(ir.files[1].path).toBe("src/bar.ts");
    expect(ir.files[1].matchCount).toBe(1);
  });

  it("handles context lines (non-match lines)", () => {
    const lines = [
      "src/foo.ts:  5:ab|before",
      "src/foo.ts:>>6:cd|match",
      "src/foo.ts:  7:ef|after",
    ];
    const ir = parseGrepIR(lines);
    expect(ir.totalMatches).toBe(1);
    expect(ir.files[0].lines).toHaveLength(3);
    expect(ir.files[0].lines[0].kind).toBe("context");
    expect(ir.files[0].lines[1].kind).toBe("match");
    expect(ir.files[0].lines[2].kind).toBe("context");
  });

  it("does not truncate when total matches <= 50", () => {
    const lines: GrepIRLine[] = Array.from({ length: 50 }, (_, i) => ({
      kind: "match",
      raw: `src/foo.ts:>>${i + 1}:ab|line ${i}`,
    }));

    const ir: GrepIR = {
      totalMatches: 50,
      files: [{ path: "src/foo.ts", matchCount: 50, lines }],
    };

    const truncated = truncateGrepIR(ir);
    expect(truncated.files[0].lines).toHaveLength(50);
  });

  it("shows only the first N matches per file when total > 50", () => {
    const lines: GrepIRLine[] = Array.from({ length: 80 }, (_, i) => ({
      kind: "match",
      raw: `src/foo.ts:>>${i + 1}:ab|line ${i}`,
    }));

    const ir: GrepIR = {
      totalMatches: 80,
      files: [{ path: "src/foo.ts", matchCount: 80, lines }],
    };

    const truncated = truncateGrepIR(ir);
    const keptMatches = truncated.files[0].lines.filter((l) => l.kind === "match");
    expect(keptMatches.length).toBeLessThan(80);
    expect(keptMatches.length).toBeGreaterThan(0);
    expect(keptMatches[0].raw).toContain(":>>1:ab|");
  });

  it("ends a truncated file with a '... +K more matches' separator", () => {
    const lines: GrepIRLine[] = Array.from({ length: 80 }, (_, i) => ({
      kind: "match",
      raw: `src/foo.ts:>>${i + 1}:ab|line ${i}`,
    }));

    const ir: GrepIR = {
      totalMatches: 80,
      files: [{ path: "src/foo.ts", matchCount: 80, lines }],
    };

    const truncated = truncateGrepIR(ir);
    expect(truncated.files[0].lines.at(-1)).toEqual({ kind: "separator", raw: "... +70 more matches" });
  });

  it("preserves all file entries even when matches are truncated", () => {
    const file1Lines: GrepIRLine[] = Array.from({ length: 40 }, (_, i) => ({
      kind: "match",
      raw: `src/a.ts:>>${i + 1}:ab|line ${i}`,
    }));

    const file2Lines: GrepIRLine[] = Array.from({ length: 20 }, (_, i) => ({
      kind: "match",
      raw: `src/b.ts:>>${i + 1}:cd|line ${i}`,
    }));

    const ir: GrepIR = {
      totalMatches: 60,
      files: [
        { path: "src/a.ts", matchCount: 40, lines: file1Lines },
        { path: "src/b.ts", matchCount: 20, lines: file2Lines },
      ],
    };

    const truncated = truncateGrepIR(ir);
    expect(truncated.files).toHaveLength(2);
    expect(truncated.files[0].path).toBe("src/a.ts");
    expect(truncated.files[1].path).toBe("src/b.ts");
  });

  it("inserts -- separator between non-adjacent context groups", () => {
    const lines: GrepIRLine[] = [
      { kind: "context", raw: "src/foo.ts:  2:a1|line 2" },
      { kind: "match", raw: "src/foo.ts:>>3:a2|line 3" },
      { kind: "context", raw: "src/foo.ts:  4:a3|line 4" },
      { kind: "context", raw: "src/foo.ts:  19:b1|line 19" },
      { kind: "match", raw: "src/foo.ts:>>20:b2|line 20" },
      { kind: "context", raw: "src/foo.ts:  21:b3|line 21" },
    ];

    const separated = separateContextGroups(lines);
    expect(separated.map((l) => l.raw)).toEqual([
      "src/foo.ts:  2:a1|line 2",
      "src/foo.ts:>>3:a2|line 3",
      "src/foo.ts:  4:a3|line 4",
      "--",
      "src/foo.ts:  19:b1|line 19",
      "src/foo.ts:>>20:b2|line 20",
      "src/foo.ts:  21:b3|line 21",
    ]);
  });

  it("does not insert -- between adjacent groups", () => {
    const lines: GrepIRLine[] = [
      { kind: "context", raw: "src/foo.ts:  2:a1|line 2" },
      { kind: "match", raw: "src/foo.ts:>>3:a2|line 3" },
      { kind: "context", raw: "src/foo.ts:  4:a3|line 4" },
      { kind: "match", raw: "src/foo.ts:>>5:a4|line 5" },
      { kind: "context", raw: "src/foo.ts:  6:a5|line 6" },
    ];

    const separated = separateContextGroups(lines);
    const raws = separated.map((l) => l.raw);
    expect(raws).not.toContain("--");
  });
});
