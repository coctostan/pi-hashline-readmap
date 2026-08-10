import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockParser {
    static instances: MockParser[] = [];
    static setLanguageError: Error | null = null;
    constructor() {
      MockParser.instances.push(this);
    }
    static init = vi.fn(async () => {});
    setLanguage = vi.fn(() => {
      if (MockParser.setLanguageError) throw MockParser.setLanguageError;
    });
    delete = vi.fn();
  }
  class MockLanguage {
    static load = vi.fn(async (wasmPath: string) => ({ wasmPath }));
  }
  return { MockParser, MockLanguage };
});

vi.mock("web-tree-sitter", () => ({
  Parser: mocks.MockParser,
  Language: mocks.MockLanguage,
}));

describe("WASM parser loader", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.MockParser.instances.length = 0;
    mocks.MockParser.setLanguageError = null;
    delete (globalThis as { Bun?: unknown }).Bun;
  });

  it("returns null under Bun without initializing", async () => {
    (globalThis as { Bun?: unknown }).Bun = {};
    const { getWasmParser, __resetWasmParserLoaderForTests } = await import("../src/readmap/parser-loader.js");
    __resetWasmParserLoaderForTests();
    await expect(getWasmParser("rust")).resolves.toBeNull();
    expect(mocks.MockParser.init).not.toHaveBeenCalled();
  });

  it("memoizes init and language loads from the Repomix package", async () => {
    const { getWasmParser, __resetWasmParserLoaderForTests } = await import("../src/readmap/parser-loader.js");
    __resetWasmParserLoaderForTests();
    const [a, b] = await Promise.all([getWasmParser("rust"), getWasmParser("rust")]);
    expect(a).toBeInstanceOf(mocks.MockParser);
    expect(b).toBeInstanceOf(mocks.MockParser);
    expect(a).not.toBe(b);
    expect(mocks.MockParser.init).toHaveBeenCalledTimes(1);
    expect(mocks.MockLanguage.load).toHaveBeenCalledTimes(1);
    expect(mocks.MockLanguage.load).toHaveBeenCalledWith(
      expect.stringMatching(/@repomix[/\\]tree-sitter-wasms[/\\]out[/\\]tree-sitter-rust\.wasm$/),
    );
    a?.delete();
    b?.delete();
  });


  it("deletes a newly allocated parser when setLanguage throws", async () => {
    const { getWasmParser, __resetWasmParserLoaderForTests } = await import("../src/readmap/parser-loader.js");
    __resetWasmParserLoaderForTests();
    mocks.MockParser.setLanguageError = new Error("incompatible grammar");

    await expect(getWasmParser("rust")).resolves.toBeNull();
    expect(mocks.MockParser.instances).toHaveLength(1);
    expect(mocks.MockParser.instances[0]!.delete).toHaveBeenCalledTimes(1);
  });

  it("maps c-header to the Repomix cpp grammar", async () => {
    const { getWasmParser, __resetWasmParserLoaderForTests } = await import("../src/readmap/parser-loader.js");
    __resetWasmParserLoaderForTests();
    await getWasmParser("c-header");
    expect(mocks.MockLanguage.load).toHaveBeenCalledWith(
      expect.stringMatching(/@repomix[/\\]tree-sitter-wasms[/\\]out[/\\]tree-sitter-cpp\.wasm$/),
    );
  });
});
