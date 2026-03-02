import { describe, it, expect } from "vitest";
import {
  parseGrepIR,
  formatGrepOutput,
  truncateGrepIR,
  deduplicateContext,
  type GrepIR,
  type GrepIRLine,
} from "../src/grep";

describe("grep context reduction", () => {
  it("formats zero matches as [0 matches in 0 files]", () => {
    const ir: GrepIR = { files: [], totalMatches: 0 };
    const output = formatGrepOutput(ir);
    expect(output).toBe("[0 matches in 0 files]");
  });

  it("prepends summary header [N matches in M files]", () => {
    const ir: GrepIR = {
      totalMatches: 3,
      files: [
        {
          path: "src/foo.ts",
          matchCount: 2,
          lines: [
            { kind: "match", raw: "src/foo.ts:>>1:ab|hello" },
            { kind: "match", raw: "src/foo.ts:>>5:cd|world" },
          ],
        },
        {
          path: "src/bar.ts",
          matchCount: 1,
          lines: [{ kind: "match", raw: "src/bar.ts:>>3:ef|baz" }],
        },
      ],
    };
    const output = formatGrepOutput(ir);
    const firstLine = output.split("\n")[0];
    expect(firstLine).toBe("[3 matches in 2 files]");
  });

  it("uses 'matches' and 'files' even for count=1", () => {
    const ir: GrepIR = {
      totalMatches: 1,
      files: [
        {
          path: "a.ts",
          matchCount: 1,
          lines: [{ kind: "match", raw: "a.ts:>>1:ab|x" }],
        },
      ],
    };
    const output = formatGrepOutput(ir);
    expect(output.split("\n")[0]).toBe("[1 matches in 1 files]");
  });

  it("per-file sections use format: --- path (K matches) ---", () => {
    const ir: GrepIR = {
      totalMatches: 2,
      files: [
        {
          path: "src/foo.ts",
          matchCount: 2,
          lines: [
            { kind: "match", raw: "src/foo.ts:>>1:ab|hello" },
            { kind: "match", raw: "src/foo.ts:>>5:cd|world" },
          ],
        },
      ],
    };
    const output = formatGrepOutput(ir);
    expect(output).toContain("--- src/foo.ts (2 matches) ---");
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

  it("preserves LINE:HASH anchors in output", () => {
    const ir: GrepIR = {
      totalMatches: 1,
      files: [
        {
          path: "src/foo.ts",
          matchCount: 1,
          lines: [{ kind: "match", raw: "src/foo.ts:>>7:a3|const x = 1;" }],
        },
      ],
    };
    const output = formatGrepOutput(ir);
    expect(output).toContain(">>7:a3|const x = 1;");
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

  it("appends '... +K more matches' footer for truncated files", () => {
    const lines: GrepIRLine[] = Array.from({ length: 80 }, (_, i) => ({
      kind: "match",
      raw: `src/foo.ts:>>${i + 1}:ab|line ${i}`,
    }));

    const ir: GrepIR = {
      totalMatches: 80,
      files: [{ path: "src/foo.ts", matchCount: 80, lines }],
    };

    const truncated = truncateGrepIR(ir);
    const output = formatGrepOutput(truncated);
    expect(output).toMatch(/\.\.\. \+\d+ more matches/);
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

  it("merges overlapping context windows — each line appears once", () => {
    const lines: GrepIRLine[] = [
      { kind: "context", raw: "src/foo.ts:  3:a1|line 3" },
      { kind: "context", raw: "src/foo.ts:  4:a2|line 4" },
      { kind: "match", raw: "src/foo.ts:>>5:a3|line 5" },
      { kind: "context", raw: "src/foo.ts:  6:a4|line 6" },
      { kind: "context", raw: "src/foo.ts:  7:a5|line 7" },
      { kind: "context", raw: "src/foo.ts:  5:a3|line 5" },
      { kind: "context", raw: "src/foo.ts:  6:a4|line 6" },
      { kind: "match", raw: "src/foo.ts:>>7:a5|line 7" },
      { kind: "context", raw: "src/foo.ts:  8:a6|line 8" },
      { kind: "context", raw: "src/foo.ts:  9:a7|line 9" },
    ];

    const deduped = deduplicateContext(lines);
    const rawTexts = deduped.map((l) => l.raw);
    expect(rawTexts.filter((r) => /(?:>>|  )3:/.test(r)).length).toBe(1);
    expect(rawTexts.filter((r) => /(?:>>|  )5:/.test(r)).length).toBe(1);
    expect(rawTexts.filter((r) => /(?:>>|  )7:/.test(r)).length).toBe(1);

    const line5 = deduped.find((l) => /(?:>>|  )5:/.test(l.raw));
    expect(line5?.kind).toBe("match");
    const line7 = deduped.find((l) => /(?:>>|  )7:/.test(l.raw));
    expect(line7?.kind).toBe("match");
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

    const deduped = deduplicateContext(lines);
    const separators = deduped.filter((l) => l.raw === "--");
    expect(separators.length).toBe(1);
  });

  it("does not insert -- between adjacent groups", () => {
    const lines: GrepIRLine[] = [
      { kind: "context", raw: "src/foo.ts:  2:a1|line 2" },
      { kind: "match", raw: "src/foo.ts:>>3:a2|line 3" },
      { kind: "context", raw: "src/foo.ts:  4:a3|line 4" },
      { kind: "context", raw: "src/foo.ts:  4:a3|line 4" },
      { kind: "match", raw: "src/foo.ts:>>5:a4|line 5" },
      { kind: "context", raw: "src/foo.ts:  6:a5|line 6" },
    ];

    const deduped = deduplicateContext(lines);
    const raws = deduped.map((l) => l.raw);
    expect(raws).not.toContain("--");
  });

  it("preserves line ordering by line number", () => {
    const lines: GrepIRLine[] = [
      { kind: "match", raw: "src/foo.ts:>>10:a1|line 10" },
      { kind: "context", raw: "src/foo.ts:  11:a2|line 11" },
      { kind: "context", raw: "src/foo.ts:  9:a0|line 9" },
      { kind: "match", raw: "src/foo.ts:>>10:a1|line 10" },
    ];

    const deduped = deduplicateContext(lines);
    const nonSep = deduped.filter((l) => l.raw !== "--");
    expect(nonSep).toHaveLength(3);
  });
});
