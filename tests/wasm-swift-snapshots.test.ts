import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { swiftMapper } from "../src/readmap/mappers/swift.js";
import { getWasmParser, __resetWasmParserLoaderForTests } from "../src/readmap/parser-loader.js";
import { SymbolKind } from "../src/readmap/enums.js";
import type { FileMap } from "../src/readmap/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
function stable(map: FileMap): FileMap {
  return { ...map, path: basename(map.path) };
}

const cases = [
  ["simple", "wasm-swift-simple.swift"],
  ["representative", "wasm-swift-representative.swift"],
] as const;

describe("Swift WASM mapper snapshots", () => {
  it("parses the modern representative fixture without tree-sitter errors", async () => {
    const fixture = resolve(__dirname, "fixtures", "wasm-swift-representative.swift");
    const parser = await getWasmParser("swift");
    expect(parser).not.toBeNull();
    const tree = parser!.parse(await readFile(fixture, "utf8"))!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
    } finally {
      tree.delete();
      parser!.delete();
    }
  });


  it("maps the modern macro fixture on consecutive invocations", async () => {
    __resetWasmParserLoaderForTests();
    const fixture = resolve(__dirname, "fixtures", "wasm-swift-representative.swift");
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const map = await swiftMapper(fixture);
      expect(map, `iteration ${iteration}`).not.toBeNull();
      expect(map!.symbols.some((symbol) => symbol.name === "assertPositive")).toBe(true);
    }
  });

  for (const [name, fileName] of cases) {
    it(`maps ${name} Swift definitions`, async () => {
      const fixture = resolve(__dirname, "fixtures", fileName);
      const map = await swiftMapper(fixture);
      expect(map).not.toBeNull();
      expect(stable(map!)).toMatchSnapshot();
    });
  }

  it("covers the modern Swift surface the regex mapper could not", async () => {
    const fixture = resolve(__dirname, "fixtures", "wasm-swift-representative.swift");
    const map = await swiftMapper(fixture);
    const byName = new Map(map!.symbols.map((s) => [s.name, s]));

    expect(byName.get("assertPositive")).toBeDefined();
    expect(byName.get("SessionStore")!.kind).toBe(SymbolKind.Class);
    expect(byName.get("Cache")!.kind).toBe(SymbolKind.Class);
    expect(byName.get("Renderable")!.kind).toBe(SymbolKind.Interface);
    expect(byName.get("ListBuilder")!.kind).toBe(SymbolKind.Class);
    expect(byName.get("makeRenderable")!.kind).toBe(SymbolKind.Function);

    const store = byName.get("SessionStore")!;
    const memberNames = (store.children ?? []).map((c) => c.name);
    expect(memberNames).toContain("deinit");
    expect(memberNames).toContain("load");
    expect(memberNames).toContain("==");
    expect(memberNames).toContain("+");
  });
});
