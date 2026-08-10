import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dirs: string[] = [];

afterEach(async () => {
  vi.doUnmock("../src/readmap/parser-loader.js");
  vi.resetModules();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function emptyRoot(type: "translation_unit" | "source_file") {
  return {
    type,
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
    hasError: false,
  };
}

describe("WASM mapper teardown failure safety", () => {
  it.each([
    ["c", "tree"],
    ["c", "parser"],
    ["swift", "tree"],
    ["swift", "parser"],
  ] as const)("keeps the %s mapper from rejecting when %s deletion throws", async (language, failure) => {
    vi.resetModules();
    const deleteTree = vi.fn(() => {
      if (failure === "tree") throw new Error("tree delete failed");
    });
    const deleteParser = vi.fn(() => {
      if (failure === "parser") throw new Error("parser delete failed");
    });
    const parser = {
      parse: vi.fn(() => ({
        rootNode: emptyRoot(language === "c" ? "translation_unit" : "source_file"),
        delete: deleteTree,
      })),
      delete: deleteParser,
    };
    vi.doMock("../src/readmap/parser-loader.js", () => ({
      getWasmParser: vi.fn(async () => parser),
    }));

    const dir = await mkdtemp(join(tmpdir(), `pi-${language}-teardown-`));
    dirs.push(dir);
    const file = join(dir, `empty.${language}`);
    await writeFile(file, "// no symbols\n", "utf8");
    const mapper =
      language === "c"
        ? (await import("../src/readmap/mappers/c.js")).cMapper
        : (await import("../src/readmap/mappers/swift.js")).swiftMapper;

    await expect(mapper(file)).resolves.toBeNull();
    expect(deleteTree).toHaveBeenCalledTimes(1);
    expect(deleteParser).toHaveBeenCalledTimes(1);
  });
});
