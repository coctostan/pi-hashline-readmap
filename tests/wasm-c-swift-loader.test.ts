import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("web-tree-sitter");
  vi.resetModules();
});

describe("C and Swift WASM loader registration", () => {
  it("returns usable C and Swift parsers on Node", async () => {
    const { getWasmParser } = await import("../src/readmap/parser-loader.js");

    const cParser = await getWasmParser("c");
    expect(cParser).not.toBeNull();
    const cTree = cParser!.parse("int main(void) { return 0; }\n")!;
    expect(cTree.rootNode.type).toBe("translation_unit");
    cTree.delete();
    cParser!.delete();

    const swiftParser = await getWasmParser("swift");
    expect(swiftParser).not.toBeNull();
    const swiftTree = swiftParser!.parse("struct Value { }\n")!;
    expect(swiftTree.rootNode.type).toBe("source_file");
    swiftTree.delete();
    swiftParser!.delete();
  });

  it("returns null under Bun without initializing or loading WASM", async () => {
    const init = vi.fn(async () => {});
    const load = vi.fn(async () => ({}));
    class MockParser {
      static init = init;
    }
    class MockLanguage {
      static load = load;
    }
    vi.doMock("web-tree-sitter", () => ({ Parser: MockParser, Language: MockLanguage }));
    vi.stubGlobal("Bun", {});
    vi.resetModules();

    const { getWasmParser } = await import("../src/readmap/parser-loader.js");
    await expect(getWasmParser("c")).resolves.toBeNull();
    await expect(getWasmParser("swift")).resolves.toBeNull();
    expect(init).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it("adds no second Parser.init call site or Language cache", () => {
    const source = readFileSync(resolve("src/readmap/parser-loader.ts"), "utf8");
    expect(source.match(/Parser\.init\(\)/g) ?? []).toHaveLength(1);
    expect(source.match(/new Map<WasmLanguageId, Language>\(\)/g) ?? []).toHaveLength(1);
  });
});
