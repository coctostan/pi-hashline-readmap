import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const dirs: string[] = [];
afterEach(async () => {
  vi.doUnmock("../src/readmap/parser-loader.js");
  vi.doUnmock("../src/readmap/mappers/ctags.js");
  vi.doUnmock("../src/readmap/mappers/fallback.js");
  vi.resetModules();
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

function rootNode() {
  return {
    type: "translation_unit",
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

describe("C WASM mapper lifecycle", () => {
  it("uses the shared WASM loader and deletes parser and tree objects", async () => {
    vi.resetModules();
    const dir = await mkdtemp(join(tmpdir(), "pi-c-wasm-"));
    dirs.push(dir);
    const file = join(dir, "empty.c");
    await writeFile(file, "// no symbols\n", "utf8");

    const deleteTree = vi.fn();
    const deleteParser = vi.fn();
    const parser = {
      parse: vi.fn(() => ({ rootNode: rootNode(), delete: deleteTree })),
      delete: deleteParser,
    };
    const getWasmParser = vi.fn(async () => parser);
    vi.doMock("../src/readmap/parser-loader.js", () => ({ getWasmParser }));

    const { cMapper, MAPPER_VERSION } = await import("../src/readmap/mappers/c.js");
    const map = await cMapper(file);

    expect(MAPPER_VERSION).toBe(2);
    expect(map).toBeNull();
    expect(getWasmParser).toHaveBeenCalledWith("c");
    expect(parser.parse).toHaveBeenCalledTimes(1);
    expect(deleteTree).toHaveBeenCalledTimes(1);
    expect(deleteParser).toHaveBeenCalledTimes(1);

    const source = readFileSync(resolve("src/readmap/mappers/c.ts"), "utf8");
    expect(source).not.toContain("C_PATTERNS");
    expect(source).not.toContain("findBlockEnd");
    expect(source).not.toContain("isInsideFunction");
  });

  it("falls through ctags then fallback when the C parser is unavailable", async () => {
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

    const dir = await mkdtemp(join(tmpdir(), "pi-c-routing-"));
    dirs.push(dir);
    const file = join(dir, "fallthrough.c");
    await writeFile(file, "int add(int a, int b) { return a + b; }\n", "utf8");
    const { generateMapWithIdentity } = await import("../src/readmap/mapper.js");

    await expect(generateMapWithIdentity(file)).resolves.toMatchObject({
      map: null,
      mapperName: "fallback",
    });
    expect(calls).toEqual(["ctags", "fallback"]);
  });

  it("keeps .h files routed through the C++ mapper", async () => {
    vi.resetModules();
    const dir = await mkdtemp(join(tmpdir(), "pi-c-header-"));
    dirs.push(dir);
    const file = join(dir, "widget.h");
    await writeFile(file, "class Widget { public: void render(); };\n", "utf8");
    const { generateMapWithIdentity } = await import("../src/readmap/mapper.js");

    const result = await generateMapWithIdentity(file);
    expect(result.mapperName).toBe("c-header");
    expect(result.map?.language).toBe("C++");
  });
});
