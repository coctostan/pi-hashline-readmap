import { describe, it, expect, beforeAll } from "vitest";
import { buildPtcLine } from "../src/ptc-value.js";
import { buildReadOutput } from "../src/read-output.js";

describe("buildReadOutput bundle sections", () => {
  beforeAll(async () => {
  });

  it("renders requested symbol and local support sections while adding ptcValue.bundle", () => {
    const sourceLines = [
      "function helperOne() {",
      "  return 1;",
      "}",
      "",
      "function helperTwo(value: number) {",
      "  return value * 2;",
      "}",
      "",
      "export function target() {",
      "  const value = helperOne();",
      "  return helperTwo(value);",
      "}",
    ];

    const built = buildReadOutput({
      path: "/tmp/local-bundle.ts",
      startLine: 9,
      endLine: 12,
      totalLines: 12,
      selectedLines: sourceLines.slice(8, 12),
      warnings: [],
      truncation: null,
      continuation: null,
      symbol: {
        query: "target",
        name: "target",
        kind: "function",
        startLine: 9,
        endLine: 12,
      },
      bundle: {
        mode: "local",
        applied: true,
        localSupport: [
          {
            symbol: {
              query: "helperOne",
              name: "helperOne",
              kind: "function",
              startLine: 1,
              endLine: 3,
            },
            lines: sourceLines.slice(0, 3),
          },
          {
            symbol: {
              query: "helperTwo",
              name: "helperTwo",
              kind: "function",
              startLine: 5,
              endLine: 7,
            },
            lines: sourceLines.slice(4, 7),
          },
        ],
        warnings: [],
      },
    } as any);

    const requestedLines = sourceLines.slice(8, 12).map((raw, index) => buildPtcLine(index + 9, raw));
    const helperOneLines = sourceLines.slice(0, 3).map((raw, index) => buildPtcLine(index + 1, raw));
    const helperTwoLines = sourceLines.slice(4, 7).map((raw, index) => buildPtcLine(index + 5, raw));

    expect(built.text).toBe([
      "[Symbol: target (function), lines 9-12 of 12]",
      "",
      "## Requested symbol",
      ...requestedLines.map((line) => `${line.anchor}|${line.display}`),
      "",
      "## Local support",
      ...helperOneLines.map((line) => `${line.anchor}|${line.display}`),
      ...helperTwoLines.map((line) => `${line.anchor}|${line.display}`),
    ].join("\n"));

    expect((built.ptcValue as any).bundle).toEqual({
      mode: "local",
      applied: true,
      localSupport: [
        {
          name: "helperOne",
          kind: "function",
          startLine: 1,
          endLine: 3,
          lineAnchors: helperOneLines.map((line) => line.anchor),
        },
        {
          name: "helperTwo",
          kind: "function",
          startLine: 5,
          endLine: 7,
          lineAnchors: helperTwoLines.map((line) => line.anchor),
        },
      ],
      warnings: [],
    });
  });
});
