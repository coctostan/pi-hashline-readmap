import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cMapper } from "../src/readmap/mappers/c.js";
import { SymbolKind } from "../src/readmap/enums.js";
import type { FileMap } from "../src/readmap/types.js";

async function mapCSource(source: string): Promise<FileMap | null> {
  const dir = await mkdtemp(join(tmpdir(), "c-macros-"));
  const file = join(dir, "macros.c");
  try {
    await writeFile(file, source, "utf8");
    return await cMapper(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("C mapper macros", () => {
  it("maps #define NAME value as a Constant with endLine equal to startLine", async () => {
    const map = await mapCSource("#define MAX 10\n");
    expect(map).not.toBeNull();
    const max = map!.symbols.find((s) => s.name === "MAX");
    expect(max).toBeDefined();
    expect(max!.kind).toBe(SymbolKind.Constant);
    expect(max!.startLine).toBe(1);
    expect(max!.endLine).toBe(1);
  });

  it("maps #define NAME(args) body as a named symbol", async () => {
    const map = await mapCSource("#define SQ(x) ((x)*(x))\n");
    expect(map).not.toBeNull();
    const sq = map!.symbols.find((s) => s.name === "SQ");
    expect(sq).toBeDefined();
    expect(sq!.kind).toBe(SymbolKind.Constant);
  });


  it("preserves function-scoped preprocessor definitions", async () => {
    const map = await mapCSource(
      "int configured(void) {\n#define LOCAL_LIMIT 4\n  return LOCAL_LIMIT;\n}\n",
    );
    expect(map!.symbols.map((s) => [s.name, s.kind])).toEqual([
      ["configured", SymbolKind.Function],
      ["LOCAL_LIMIT", SymbolKind.Constant],
    ]);
  });
});
