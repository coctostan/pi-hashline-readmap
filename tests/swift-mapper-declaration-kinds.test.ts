import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SymbolKind } from "../src/readmap/enums.js";
import type { FileMap } from "../src/readmap/types.js";

async function mapSwiftSource(source: string): Promise<FileMap | null> {
  const dir = await mkdtemp(join(tmpdir(), "swift-kinds-"));
  const file = join(dir, "kinds.swift");
  try {
    await writeFile(file, source, "utf8");
    const { swiftMapper } = await import("../src/readmap/mappers/swift.js");
    return await swiftMapper(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const dirs: string[] = [];
afterEach(async () => {
  vi.doUnmock("../src/readmap/parser-loader.js");
  vi.doUnmock("../src/readmap/mappers/ctags.js");
  vi.doUnmock("../src/readmap/mappers/fallback.js");
  vi.resetModules();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Swift mapper declaration kinds", () => {
  it("distinguishes the five declarations collapsed into class_declaration", async () => {
    const map = await mapSwiftSource(
      "class C { }\nstruct S { }\nactor A { }\nenum E { case a }\nextension Array { }\n"
    );
    expect(map).not.toBeNull();
    const byName = new Map(map!.symbols.map((s) => [s.name, s]));
    expect(byName.get("C")!.kind).toBe(SymbolKind.Class);
    expect(byName.get("S")!.kind).toBe(SymbolKind.Class);
    expect(byName.get("A")!.kind).toBe(SymbolKind.Class);
    expect(byName.get("E")!.kind).toBe(SymbolKind.Enum);
    expect(byName.get("Array")!.kind).toBe(SymbolKind.Class);
  });

  it("maps a protocol as an Interface", async () => {
    const map = await mapSwiftSource("protocol Drawable { func draw() }\n");
    const drawable = map!.symbols.find((s) => s.name === "Drawable");
    expect(drawable!.kind).toBe(SymbolKind.Interface);
  });

  it("names an extension from its user_type child", async () => {
    const map = await mapSwiftSource("extension Collection where Element: Hashable { }\n");
    expect(map!.symbols.map((s) => s.name)).toEqual(["Collection"]);
  });

  it("extracts operator overload names from the anonymous token after func", async () => {
    const map = await mapSwiftSource(
      "struct V {\n  static func == (l: V, r: V) -> Bool { true }\n  static func + (l: V, r: V) -> V { l }\n}\n"
    );
    const v = map!.symbols.find((s) => s.name === "V");
    const names = (v!.children ?? []).map((c) => c.name);
    expect(names).toContain("==");
    expect(names).toContain("+");
    for (const child of v!.children ?? []) {
      expect(child.name.length).toBeGreaterThan(0);
    }
  });


  it("skips comments between func and identifier or operator names", async () => {
    const map = await mapSwiftSource(
      "func /* docs */ top() {}\n" +
        "struct V { static func /* docs */ == (l: V, r: V) -> Bool { true } }\n" +
        "protocol P { func /* docs */ requirement() }\n",
    );
    const v = map!.symbols.find((symbol) => symbol.name === "V")!;
    const protocol = map!.symbols.find((symbol) => symbol.name === "P")!;

    expect(map!.symbols[0]!.name).toBe("top");
    expect(v.children?.map((symbol) => symbol.name)).toEqual(["=="]);
    expect(protocol.children?.map((symbol) => symbol.name)).toEqual(["requirement"]);
  });

  it("nests methods under their type and keeps top-level functions at the root", async () => {
    const map = await mapSwiftSource(
      "class Box {\n  func inner() { }\n}\nfunc topLevel() { }\n"
    );
    const box = map!.symbols.find((s) => s.name === "Box");
    expect(box!.children!.map((c) => c.name)).toEqual(["inner"]);
    expect(box!.children![0]!.kind).toBe(SymbolKind.Method);
    const top = map!.symbols.find((s) => s.name === "topLevel");
    expect(top!.kind).toBe(SymbolKind.Function);
  });

  it("nests deinit as a lifecycle child symbol", async () => {
    const map = await mapSwiftSource("class Res {\n  deinit { }\n}\n");
    const res = map!.symbols.find((s) => s.name === "Res");
    expect(res!.children!.map((c) => c.name)).toEqual(["deinit"]);
  });

  it("maps a nested type once without duplicating sibling methods", async () => {
    const map = await mapSwiftSource(
      "class Outer {\n  func before() { }\n  struct Inner { func nested() { } }\n  func after() { }\n}\n",
    );
    const outer = map!.symbols.find((s) => s.name === "Outer")!;
    expect((outer.children ?? []).map((s) => s.name)).toEqual([
      "before",
      "Inner",
      "after",
    ]);
    expect(outer.children?.find((s) => s.name === "Inner")?.children?.map((s) => s.name)).toEqual(["nested"]);
  });

  it("falls through ctags then fallback when the Swift parser is unavailable", async () => {
    vi.resetModules();
    const calls: string[] = [];
    vi.doMock("../src/readmap/parser-loader.js", () => ({
      getWasmParser: vi.fn(async () => null),
    }));
    vi.doMock("../src/readmap/mappers/ctags.js", () => ({
      MAPPER_VERSION: 1,
      ctagsMapper: vi.fn(async () => {
        calls.push("ctags");
        return null;
      }),
    }));
    vi.doMock("../src/readmap/mappers/fallback.js", () => ({
      MAPPER_VERSION: 1,
      fallbackMapper: vi.fn(async () => {
        calls.push("fallback");
        return null;
      }),
    }));

    const dir = await mkdtemp(join(tmpdir(), "swift-routing-"));
    dirs.push(dir);
    const file = join(dir, "fallthrough.swift");
    await writeFile(file, "struct Value { }\n", "utf8");
    const { generateMapWithIdentity } = await import("../src/readmap/mapper.js");

    await expect(generateMapWithIdentity(file)).resolves.toMatchObject({
      map: null,
      mapperName: "fallback",
    });
    expect(calls).toEqual(["ctags", "fallback"]);
  });

  it("no longer contains regex declaration scanning", () => {
    const source = readFileSync(resolve("src/readmap/mappers/swift.ts"), "utf8");
    expect(source).not.toContain("SWIFT_CONTAINER_DECL_RE");
    expect(source).not.toContain("SWIFT_FUNC_DECL_RE");
    expect(source).not.toContain("SWIFT_DEINIT_DECL_RE");
    expect(source).not.toContain("parseSwiftDeclaration");
    expect(source).not.toContain("countChar");
    expect(source).not.toContain("braceDepth");
  });
});
