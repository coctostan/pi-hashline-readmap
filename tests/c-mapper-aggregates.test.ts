import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cMapper } from "../src/readmap/mappers/c.js";
import { SymbolKind } from "../src/readmap/enums.js";
import type { FileMap } from "../src/readmap/types.js";

async function mapCSource(source: string): Promise<FileMap | null> {
  const dir = await mkdtemp(join(tmpdir(), "c-aggregates-"));
  const file = join(dir, "aggregates.c");
  try {
    await writeFile(file, source, "utf8");
    return await cMapper(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("C mapper aggregates", () => {
  it("maps a named struct as a Class symbol", async () => {
    const map = await mapCSource("struct Point { int x; int y; };\n");
    const point = map!.symbols.find((s) => s.name === "Point");
    expect(point).toBeDefined();
    expect(point!.kind).toBe(SymbolKind.Class);
  });

  it("maps a union as a Class symbol carrying the union modifier", async () => {
    const map = await mapCSource("union Value { int i; float f; };\n");
    const value = map!.symbols.find((s) => s.name === "Value");
    expect(value).toBeDefined();
    expect(value!.kind).toBe(SymbolKind.Class);
    expect(value!.modifiers).toEqual(["union"]);
  });

  it("maps a named enum as an Enum symbol", async () => {
    const map = await mapCSource("enum Color { RED, GREEN };\n");
    const color = map!.symbols.find((s) => s.name === "Color");
    expect(color).toBeDefined();
    expect(color!.kind).toBe(SymbolKind.Enum);
  });

  it.each([
    ["struct", "struct { int q; } value;\n", "(anonymous struct)"],
    ["union", "union { int q; } value;\n", "(anonymous union)"],
    ["enum", "enum { VALUE } value;\n", "(anonymous enum)"],
  ] as const)(
    "gives an anonymous %s a deterministic non-empty name",
    async (_kind, source, expected) => {
      const first = await mapCSource(source);
      const second = await mapCSource(source);
      expect(first!.symbols[0]!.name).toBe(expected);
      expect(second!.symbols[0]!.name).toBe(expected);
    },
  );
});
