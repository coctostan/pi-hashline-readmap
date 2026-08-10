import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cMapper } from "../src/readmap/mappers/c.js";
import { SymbolKind } from "../src/readmap/enums.js";
import type { FileMap } from "../src/readmap/types.js";

async function mapCSource(source: string): Promise<FileMap | null> {
  const dir = await mkdtemp(join(tmpdir(), "c-functions-"));
  const file = join(dir, "functions.c");
  try {
    await writeFile(file, source, "utf8");
    return await cMapper(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("C mapper functions", () => {
  it("maps a function definition as an exported Function", async () => {
    const map = await mapCSource("int add(int a, int b) { return a + b; }\n");
    const add = map!.symbols.find((s) => s.name === "add");
    expect(add).toBeDefined();
    expect(add!.kind).toBe(SymbolKind.Function);
    expect(add!.isExported).toBe(true);
  });

  it("marks a static function as not exported", async () => {
    const map = await mapCSource("static int helper(int a) { return a; }\n");
    const helper = map!.symbols.find((s) => s.name === "helper");
    expect(helper).toBeDefined();
    expect(helper!.isExported).toBe(false);
  });

  it("maps a K&R style function definition", async () => {
    const map = await mapCSource("int old_style(a, b) int a; int b; { return a + b; }\n");
    const old = map!.symbols.find((s) => s.name === "old_style");
    expect(old).toBeDefined();
    expect(old!.kind).toBe(SymbolKind.Function);
  });

  it("maps an __attribute__ annotated prototype", async () => {
    const map = await mapCSource("__attribute__((noreturn)) void die(void);\n");
    const die = map!.symbols.find((s) => s.name === "die");
    expect(die).toBeDefined();
    expect(die!.kind).toBe(SymbolKind.Function);
  });


  it("uses the AST body boundary when a comment contains an opening brace", async () => {
    const map = await mapCSource(
      "int /* { in comment */ commented(void) { return 0; }\n",
    );
    const commented = map!.symbols.find((s) => s.name === "commented");
    expect(commented!.signature).toBe("int /* { in comment */ commented(void)");
  });

  it("does not emit symbols for calls inside a function body", async () => {
    const map = await mapCSource("int outer(void) { inner(1); return 0; }\n");
    expect(map!.symbols.map((s) => s.name)).toEqual(["outer"]);
  });
});
