import { expect, it } from "vitest";

import { DetailLevel, SymbolKind } from "../src/readmap/enums.js";
import { symbolsFromJsonSource } from "../src/readmap/mappers/json-source.js";
import { findSymbol } from "../src/readmap/symbol-lookup.js";
import type { FileMap } from "../src/readmap/types.js";

it("keeps repeated nested names addressable through their object paths", () => {
  const source = [
    "{",
    '  "left": {',
    '    "same": 1',
    "  },",
    '  "right": {',
    '    "same": 2',
    "  }",
    "}",
  ].join("\n");
  const map: FileMap = {
    path: "/tmp/nested.json",
    totalLines: source.split("\n").length,
    totalBytes: Buffer.byteLength(source),
    language: "JSON",
    symbols: symbolsFromJsonSource(source),
    imports: [],
    detailLevel: DetailLevel.Full,
  };

  expect(findSymbol(map, "left.same")).toMatchObject({
    type: "found",
    symbol: {
      name: "same",
      kind: SymbolKind.Property,
      parentName: "left",
      startLine: 3,
      endLine: 3,
    },
  });
  expect(findSymbol(map, "right.same")).toMatchObject({
    type: "found",
    symbol: {
      name: "same",
      kind: SymbolKind.Property,
      parentName: "right",
      startLine: 6,
      endLine: 6,
    },
  });
  expect(map.symbols).toMatchObject([
    { name: "left", startLine: 2, endLine: 4 },
    { name: "right", startLine: 5, endLine: 7 },
  ]);
});
