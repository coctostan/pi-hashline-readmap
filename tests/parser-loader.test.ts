import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockParser {
    static init = vi.fn(async () => {});
    setLanguage = vi.fn();
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

  it("maps c-header to the Repomix cpp grammar", async () => {
    const { getWasmParser, __resetWasmParserLoaderForTests } = await import("../src/readmap/parser-loader.js");
    __resetWasmParserLoaderForTests();
    await getWasmParser("c-header");
    expect(mocks.MockLanguage.load).toHaveBeenCalledWith(
      expect.stringMatching(/@repomix[/\\]tree-sitter-wasms[/\\]out[/\\]tree-sitter-cpp\.wasm$/),
    );
  });
});
