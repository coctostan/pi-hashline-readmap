import { describe, it, expect, beforeAll } from "vitest";
import { buildPtcLine } from "../src/ptc-value.js";
import { buildGrepOutput } from "../src/grep-output.js";

describe("buildGrepOutput symbol scope", () => {
  beforeAll(async () => {
  });

  it("renders grouped symbol blocks and additive scopes metadata without replacing records", () => {
    const absolutePath = "/tmp/scoped.ts";
    const displayPath = "scoped.ts";
    const rawLines = [
      "export function alpha() {",
      "  const target = 1;",
      "  return target + target;",
      "}",
    ];

    const ptcLines = rawLines.map((raw, index) => buildPtcLine(index + 1, raw));
    const records = ptcLines.map((line, index) => ({
      ...line,
      path: absolutePath,
      kind: index === 1 || index === 2 ? ("match" as const) : ("context" as const),
    }));
    const compactRecords = ptcLines.map((line, index) => ({
      path: absolutePath,
      line: line.line,
      anchor: line.anchor,
      kind: index === 1 || index === 2 ? ("match" as const) : ("context" as const),
    }));

    const built = buildGrepOutput({
      summary: false,
      totalMatches: 2,
      groups: [
        {
          displayPath,
          absolutePath,
          matchCount: 2,
          scope: {
            mode: "symbol",
            symbol: {
              name: "alpha",
              kind: "function",
              startLine: 1,
              endLine: 4,
            },
            matchLines: [2, 3],
          },
          entries: ptcLines.map((line, index) => ({
            kind: index === 1 || index === 2 ? ("match" as const) : ("context" as const),
            line,
          })),
        },
      ],
      records,
      scopeMode: "symbol",
      scopeWarnings: [],
    });

    expect(built.text).toBe([
      "[2 matches in 1 files]",
      "--- scoped.ts :: function alpha (1-4, 2 matches) ---",
      `scoped.ts:  ${ptcLines[0].anchor}|${ptcLines[0].display}`,
      `scoped.ts:>>${ptcLines[1].anchor}|${ptcLines[1].display}`,
      `scoped.ts:>>${ptcLines[2].anchor}|${ptcLines[2].display}`,
      `scoped.ts:  ${ptcLines[3].anchor}|${ptcLines[3].display}`,
    ].join("\n"));

    expect(Object.keys(built.ptcValue.records[0]).sort()).toEqual(["anchor", "kind", "line", "path"]);
    expect(built.ptcValue.records).toEqual(compactRecords);
    expect(built.ptcValue.scopes).toEqual({
      mode: "symbol",
      groups: [
        {
          path: absolutePath,
          displayPath,
          symbol: {
            name: "alpha",
            kind: "function",
            startLine: 1,
            endLine: 4,
          },
          matchCount: 2,
          matchLines: [2, 3],
          lineAnchors: ptcLines.map((line) => line.anchor),
        },
      ],
      warnings: [],
    });
  });
});
