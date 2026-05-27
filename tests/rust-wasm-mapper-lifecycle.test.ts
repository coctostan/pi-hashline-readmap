import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function rootNode() {
  return {
    type: "source_file",
    namedChildren: [],
    namedChildCount: 0,
    childCount: 0,
    child: vi.fn(() => null),
    namedChild: vi.fn(() => null),
    childForFieldName: vi.fn(() => null),
    startIndex: 0,
    endIndex: 0,
    startPosition: { row: 0 },
    endPosition: { row: 0 },
    isMissing: false,
  };
}

describe("Rust WASM mapper lifecycle", () => {
  it("uses the shared WASM loader and deletes parser and tree objects", async () => {
    vi.resetModules();
    const deleteTree = vi.fn();
    const deleteParser = vi.fn();
    const parser = {
      parse: vi.fn(() => ({ rootNode: rootNode(), delete: deleteTree })),
      delete: deleteParser,
    };
    vi.doMock("../src/readmap/parser-loader.js", () => ({
      getWasmParser: vi.fn(async () => parser),
    }));
    const { rustMapperFromContent, MAPPER_VERSION } = await import(
      "../src/readmap/mappers/rust.js"
    );
    const map = await rustMapperFromContent("virtual.rs", "// no symbols\n");
    expect(MAPPER_VERSION).toBe(3);
    expect(map).toBeNull();
    expect(parser.parse).toHaveBeenCalledTimes(1);
    expect(deleteTree).toHaveBeenCalledTimes(1);
    expect(deleteParser).toHaveBeenCalledTimes(1);
    const source = readFileSync(resolve("src/readmap/mappers/rust.ts"), "utf8");
    expect(source).not.toContain("tree-sitter-rust");
    expect(source).not.toContain("createRequire");
    expect(source).not.toContain("ensureWritableTypeProperty");
  });
});
