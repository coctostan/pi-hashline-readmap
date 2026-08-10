import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cMapper } from "../src/readmap/mappers/c.js";
import { SymbolKind } from "../src/readmap/enums.js";
import type { FileMap } from "../src/readmap/types.js";

async function mapCSource(source: string): Promise<FileMap | null> {
  const dir = await mkdtemp(join(tmpdir(), "c-typedefs-"));
  const file = join(dir, "typedefs.c");
  try {
    await writeFile(file, source, "utf8");
    return await cMapper(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("C mapper typedefs", () => {
  it("maps a plain typedef alias as a Type symbol", async () => {
    const map = await mapCSource("typedef int myint;\n");
    const alias = map!.symbols.find((s) => s.name === "myint");
    expect(alias).toBeDefined();
    expect(alias!.kind).toBe(SymbolKind.Type);
  });

  it("names a typedef'd anonymous struct after its alias", async () => {
    const map = await mapCSource("typedef struct { int a; } Anon;\n");
    expect(map!.symbols.map((s) => s.name)).toEqual(["Anon"]);
    expect(map!.symbols[0]!.kind).toBe(SymbolKind.Class);
  });

  it("maps a multiline function-pointer typedef spanning its full line range", async () => {
    const map = await mapCSource(
      "typedef int (*handler_t)(void *ctx,\n                         int flags);\n"
    );
    const handler = map!.symbols.find((s) => s.name === "handler_t");
    expect(handler).toBeDefined();
    expect(handler!.kind).toBe(SymbolKind.Type);
    expect(handler!.startLine).toBe(1);
    expect(handler!.endLine).toBe(2);
  });


  it("maps every alias in a multi-declarator typedef", async () => {
    const map = await mapCSource("typedef int A, B, *C;\n");
    expect(map!.symbols.map((s) => [s.name, s.kind])).toEqual([
      ["A", SymbolKind.Type],
      ["B", SymbolKind.Type],
      ["C", SymbolKind.Type],
    ]);
  });

  it("maps every aggregate typedef alias without duplicating its tag", async () => {
    const map = await mapCSource(
      "typedef struct Node { int value; } Node, *NodePtr;\n",
    );
    expect(map!.symbols.map((s) => [s.name, s.kind])).toEqual([
      ["Node", SymbolKind.Class],
      ["NodePtr", SymbolKind.Type],
    ]);
  });


  it("keeps derived aggregate typedefs as Type symbols", async () => {
    const map = await mapCSource(
      "typedef struct S { int value; } T, (*Factory)(void), Array[2];\n",
    );
    expect(map!.symbols.map((s) => [s.name, s.kind])).toEqual([
      ["S", SymbolKind.Class],
      ["T", SymbolKind.Class],
      ["Factory", SymbolKind.Type],
      ["Array", SymbolKind.Type],
    ]);
  });


  it("does not emit an aggregate definition for a typedef tag reference", async () => {
    const map = await mapCSource(
      "typedef struct Forward *ForwardPtr;\ntypedef struct Forward Forward;\n",
    );
    expect(map!.symbols.map((s) => [s.name, s.kind])).toEqual([
      ["ForwardPtr", SymbolKind.Type],
      ["Forward", SymbolKind.Class],
    ]);
  });

  it("builds a distinct signature for each plain typedef alias", async () => {
    const map = await mapCSource("typedef int A, *B;\n");
    expect(map!.symbols.map((s) => [s.name, s.signature])).toEqual([
      ["A", "typedef int A"],
      ["B", "typedef int *B"],
    ]);
  });
});
