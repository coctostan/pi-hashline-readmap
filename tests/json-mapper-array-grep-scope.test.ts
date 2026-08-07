import { beforeAll, expect, it } from "vitest";

import { scopeGrepGroupsToSymbols } from "../src/grep-symbol-scope.js";
import { ensureHashInit } from "../src/hashline.js";
import { DetailLevel, SymbolKind } from "../src/readmap/enums.js";
import { symbolsFromJsonSource } from "../src/readmap/mappers/json-source.js";
import type { FileMap } from "../src/readmap/types.js";

beforeAll(async () => {
  await ensureHashInit();
});

it("scopes a match to the property in the matching array element", () => {
  const source = [
    "{",
    '  "items": [',
    "    {",
    '      "name": "first"',
    "    },",
    "    {",
    '      "name": "second"',
    "    }",
    "  ]",
    "}",
  ].join("\n");
  const lines = source.split("\n");
  const filePath = "/tmp/items.json";
  const map: FileMap = {
    path: filePath,
    totalLines: lines.length,
    totalBytes: Buffer.byteLength(source),
    language: "JSON",
    symbols: symbolsFromJsonSource(source),
    imports: [],
    detailLevel: DetailLevel.Full,
  };

  const scoped = scopeGrepGroupsToSymbols({
    groups: [
      {
        displayPath: "items.json",
        absolutePath: filePath,
        matchCount: 1,
        entries: [
          {
            kind: "match",
            line: {
              line: 7,
              hash: "000",
              anchor: "7:000",
              raw: lines[6]!,
              display: lines[6]!,
            },
          },
        ],
      },
    ],
    fileLinesByPath: new Map([[filePath, lines]]),
    fileMapsByPath: new Map([[filePath, map]]),
    contextLines: 0,
  });

  expect(scoped.warnings).toEqual([]);
  expect(scoped.groups[0]?.scope).toEqual({
    mode: "symbol",
    symbol: {
      name: "name",
      kind: SymbolKind.Property,
      parentName: "[1]",
      startLine: 7,
      endLine: 7,
    },
    matchLines: [7],
  });
  expect(scoped.groups[0]?.entries).toMatchObject([
    { kind: "match", line: { line: 7, raw: '      "name": "second"' } },
  ]);
});
