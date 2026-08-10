import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

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

describe("Swift WASM mapper lifecycle", () => {
  it("uses the shared WASM loader and deletes parser and tree objects", async () => {
    vi.resetModules();
    const dir = await mkdtemp(join(tmpdir(), "pi-swift-wasm-"));
    dirs.push(dir);
    const file = join(dir, "empty.swift");
    await writeFile(file, "// no symbols\n", "utf8");

    const deleteTree = vi.fn();
    const deleteParser = vi.fn();
    const parser = {
      parse: vi.fn(() => ({ rootNode: rootNode(), delete: deleteTree })),
      delete: deleteParser,
    };
    const getWasmParser = vi.fn(async () => parser);
    vi.doMock("../src/readmap/parser-loader.js", () => ({ getWasmParser }));

    const { swiftMapper, MAPPER_VERSION } = await import(
      "../src/readmap/mappers/swift.js"
    );
    const map = await swiftMapper(file);

    expect(MAPPER_VERSION).toBe(2);
    expect(map).toBeNull();
    expect(getWasmParser).toHaveBeenCalledWith("swift");
    expect(parser.parse).toHaveBeenCalledTimes(1);
    expect(deleteTree).toHaveBeenCalledTimes(1);
    expect(deleteParser).toHaveBeenCalledTimes(1);

    const source = readFileSync(resolve("src/readmap/mappers/swift.ts"), "utf8");
    expect(source).toContain("getWasmParser");
    expect(source).not.toContain("createRequire");
  });
});
