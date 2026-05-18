import { beforeAll, describe, expect, it } from "vitest";
import { buildPtcLine } from "../src/ptc-value.js";
import { scopeGrepGroupsToSymbols } from "../src/grep-symbol-scope.js";
import { DetailLevel, SymbolKind } from "../src/readmap/enums.js";
import type { FileMap } from "../src/readmap/types.js";

describe("scopeGrepGroupsToSymbols ordering", () => {
  beforeAll(async () => {
  });

  it("keeps deterministic ordering when groups include separators", () => {
    const lines = ["export function alpha() {", "  const x = 1;", "}"];
    const map: FileMap = {
      path: "/tmp/a.ts",
      totalLines: 3,
      totalBytes: lines.join("\n").length,
      language: "typescript",
      detailLevel: DetailLevel.Full,
      imports: [],
      symbols: [{ name: "alpha", kind: SymbolKind.Function, startLine: 1, endLine: 3 }],
    };

    const scoped = scopeGrepGroupsToSymbols({
      groups: [
        {
          displayPath: "a.ts",
          absolutePath: "/tmp/a.ts",
          matchCount: 1,
          entries: [
            { kind: "separator", text: "--" },
            { kind: "match", line: buildPtcLine(2, lines[1]) },
          ],
        },
      ],
      fileLinesByPath: new Map([["/tmp/a.ts", lines]]),
      fileMapsByPath: new Map([["/tmp/a.ts", map]]),
      contextLines: 0,
    });

    expect(scoped.warnings).toEqual([]);
    expect(scoped.groups).toHaveLength(1);
    expect(scoped.groups[0].scope?.symbol.name).toBe("alpha");
  });

  it("accepts scopeContext and records it on scope.contextLines while preserving full-body entries when undefined", () => {
    const lines = ["export function alpha() {", "  const x = 1;", "  const y = 2;", "}"];
    const map: FileMap = {
      path: "/tmp/b.ts",
      totalLines: 4,
      totalBytes: lines.join("\n").length,
      language: "typescript",
      detailLevel: DetailLevel.Full,
      imports: [],
      symbols: [{ name: "alpha", kind: SymbolKind.Function, startLine: 1, endLine: 4 }],
    };

    const omitted = scopeGrepGroupsToSymbols({
      groups: [
        {
          displayPath: "b.ts",
          absolutePath: "/tmp/b.ts",
          matchCount: 1,
          entries: [{ kind: "match", line: buildPtcLine(2, lines[1]) }],
        },
      ],
      fileLinesByPath: new Map([["/tmp/b.ts", lines]]),
      fileMapsByPath: new Map([["/tmp/b.ts", map]]),
      contextLines: 0,
    });
    expect(omitted.groups).toHaveLength(1);
    expect(omitted.groups[0].scope?.contextLines).toBeUndefined();
    expect(omitted.groups[0].entries).toHaveLength(4);

    const withCtx = scopeGrepGroupsToSymbols({
      groups: [
        {
          displayPath: "b.ts",
          absolutePath: "/tmp/b.ts",
          matchCount: 1,
          entries: [{ kind: "match", line: buildPtcLine(2, lines[1]) }],
        },
      ],
      fileLinesByPath: new Map([["/tmp/b.ts", lines]]),
      fileMapsByPath: new Map([["/tmp/b.ts", map]]),
      contextLines: 0,
      scopeContext: 3,
    });
    expect(withCtx.groups).toHaveLength(1);
    expect(withCtx.groups[0].scope?.contextLines).toBe(3);
  });

  it("emits only the match line when scopeContext is 0", () => {
    const lines = [
      "export function alpha() {",
      "  const a = 1;",
      "  const b = 2;",
      "  const c = 3;",
      "  const d = 4;",
      "}",
    ];
    const map: FileMap = {
      path: "/tmp/c.ts",
      totalLines: 6,
      totalBytes: lines.join("\n").length,
      language: "typescript",
      detailLevel: DetailLevel.Full,
      imports: [],
      symbols: [{ name: "alpha", kind: SymbolKind.Function, startLine: 1, endLine: 6 }],
    };

    const scoped = scopeGrepGroupsToSymbols({
      groups: [
        {
          displayPath: "c.ts",
          absolutePath: "/tmp/c.ts",
          matchCount: 1,
          entries: [{ kind: "match", line: buildPtcLine(3, lines[2]) }],
        },
      ],
      fileLinesByPath: new Map([["/tmp/c.ts", lines]]),
      fileMapsByPath: new Map([["/tmp/c.ts", map]]),
      contextLines: 0,
      scopeContext: 0,
    });

    expect(scoped.groups).toHaveLength(1);
    const entries = scoped.groups[0].entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("match");
    expect(entries[0].kind === "match" && entries[0].line.line).toBe(3);
  });

  it("emits ±N context lines clipped at symbol start boundary", () => {
    const lines = [
      "export function alpha() {",
      "  const target = 1;",
      "  const a = 2;",
      "  const b = 3;",
      "  const c = 4;",
      "  const d = 5;",
      "  const e = 6;",
      "  const f = 7;",
      "  return target;",
      "}",
    ];
    const map: FileMap = {
      path: "/tmp/d.ts",
      totalLines: 10,
      totalBytes: lines.join("\n").length,
      language: "typescript",
      detailLevel: DetailLevel.Full,
      imports: [],
      symbols: [{ name: "alpha", kind: SymbolKind.Function, startLine: 1, endLine: 10 }],
    };

    const scoped = scopeGrepGroupsToSymbols({
      groups: [
        {
          displayPath: "d.ts",
          absolutePath: "/tmp/d.ts",
          matchCount: 1,
          entries: [{ kind: "match", line: buildPtcLine(2, lines[1]) }],
        },
      ],
      fileLinesByPath: new Map([["/tmp/d.ts", lines]]),
      fileMapsByPath: new Map([["/tmp/d.ts", map]]),
      contextLines: 0,
      scopeContext: 3,
    });

    const emittedLineNumbers = scoped.groups[0].entries
      .filter((e): e is Extract<typeof e, { kind: "match" | "context" }> => e.kind !== "separator")
      .map((e) => e.line.line);
    expect(emittedLineNumbers).toEqual([1, 2, 3, 4, 5]);
  });

  it("clips window at symbol endLine when match is near end", () => {
    const lines = [
      "export function alpha() {",
      "  const a = 1;",
      "  const b = 2;",
      "  const c = 3;",
      "  const d = 4;",
      "  const e = 5;",
      "  const f = 6;",
      "  const g = 7;",
      "  return target;",
      "}",
    ];
    const map: FileMap = {
      path: "/tmp/e.ts",
      totalLines: 10,
      totalBytes: lines.join("\n").length,
      language: "typescript",
      detailLevel: DetailLevel.Full,
      imports: [],
      symbols: [{ name: "alpha", kind: SymbolKind.Function, startLine: 1, endLine: 10 }],
    };

    const scoped = scopeGrepGroupsToSymbols({
      groups: [
        {
          displayPath: "e.ts",
          absolutePath: "/tmp/e.ts",
          matchCount: 1,
          entries: [{ kind: "match", line: buildPtcLine(9, lines[8]) }],
        },
      ],
      fileLinesByPath: new Map([["/tmp/e.ts", lines]]),
      fileMapsByPath: new Map([["/tmp/e.ts", map]]),
      contextLines: 0,
      scopeContext: 3,
    });

    const emittedLineNumbers = scoped.groups[0].entries
      .filter((e): e is Extract<typeof e, { kind: "match" | "context" }> => e.kind !== "separator")
      .map((e) => e.line.line);
    expect(emittedLineNumbers).toEqual([6, 7, 8, 9, 10]);
  });

  it("merges two matches with overlapping windows into one contiguous range without duplicates", () => {
    const lines = [
      "export function alpha() {",
      "  const a = 1;",
      "  const target = 2;",
      "  const c = 3;",
      "  const d = 4;",
      "  const target2 = 5;",
      "  const f = 6;",
      "  return 0;",
      "}",
    ];
    const map: FileMap = {
      path: "/tmp/f.ts",
      totalLines: 9,
      totalBytes: lines.join("\n").length,
      language: "typescript",
      detailLevel: DetailLevel.Full,
      imports: [],
      symbols: [{ name: "alpha", kind: SymbolKind.Function, startLine: 1, endLine: 9 }],
    };

    const scoped = scopeGrepGroupsToSymbols({
      groups: [
        {
          displayPath: "f.ts",
          absolutePath: "/tmp/f.ts",
          matchCount: 2,
          entries: [
            { kind: "match", line: buildPtcLine(3, lines[2]) },
            { kind: "match", line: buildPtcLine(6, lines[5]) },
          ],
        },
      ],
      fileLinesByPath: new Map([["/tmp/f.ts", lines]]),
      fileMapsByPath: new Map([["/tmp/f.ts", map]]),
      contextLines: 0,
      scopeContext: 2,
    });

    const entries = scoped.groups[0].entries;
    const emittedLineNumbers = entries
      .filter((e): e is Extract<typeof e, { kind: "match" | "context" }> => e.kind !== "separator")
      .map((e) => e.line.line);
    expect(emittedLineNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("emits a '--' separator between non-overlapping windows in the same symbol", () => {
    const lines = [
      "export function alpha() {",
      "  const a = 1;",
      "  const target = 2;",
      "  const c = 3;",
      "  const d = 4;",
      "  const e = 5;",
      "  const f = 6;",
      "  const g = 7;",
      "  const h = 8;",
      "  const target2 = 9;",
      "  const j = 10;",
      "  return 0;",
      "}",
    ];
    const map: FileMap = {
      path: "/tmp/g.ts",
      totalLines: 13,
      totalBytes: lines.join("\n").length,
      language: "typescript",
      detailLevel: DetailLevel.Full,
      imports: [],
      symbols: [{ name: "alpha", kind: SymbolKind.Function, startLine: 1, endLine: 13 }],
    };

    const scoped = scopeGrepGroupsToSymbols({
      groups: [
        {
          displayPath: "g.ts",
          absolutePath: "/tmp/g.ts",
          matchCount: 2,
          entries: [
            { kind: "match", line: buildPtcLine(3, lines[2]) },
            { kind: "match", line: buildPtcLine(10, lines[9]) },
          ],
        },
      ],
      fileLinesByPath: new Map([["/tmp/g.ts", lines]]),
      fileMapsByPath: new Map([["/tmp/g.ts", map]]),
      contextLines: 0,
      scopeContext: 1,
    });

    const entries = scoped.groups[0].entries;
    const separators = entries.filter((e) => e.kind === "separator");
    expect(separators).toHaveLength(1);
    expect(separators[0]).toEqual({ kind: "separator", text: "--" });

    const shape = entries.map((e) => (e.kind === "separator" ? "--" : e.line.line));
    expect(shape).toEqual([2, 3, 4, "--", 9, 10, 11]);
  });
});
