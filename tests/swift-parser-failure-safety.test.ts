import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dirs: string[] = [];
afterEach(async () => {
  delete process.env.PI_HASHLINE_READMAP_DEBUG;
  vi.restoreAllMocks();
  vi.doUnmock("../src/readmap/parser-loader.js");
  vi.resetModules();
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("Swift WASM parser failure safety", () => {
  it("swallows parser corruption exceptions and reports in debug mode", async () => {
    process.env.PI_HASHLINE_READMAP_DEBUG = "1";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const parse = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("simulated parser corruption");
      })
      .mockImplementationOnce(() => {
        throw new Error("simulated parser corruption");
      })
      .mockImplementationOnce(() => {
        throw new Error("different parser corruption");
      });
    const parser = { parse, delete: vi.fn() };
    vi.doMock("../src/readmap/parser-loader.js", () => ({
      getWasmParser: vi.fn(async () => parser),
    }));

    const { swiftMapper } = await import("../src/readmap/mappers/swift.js");
    const dir = await mkdtemp(join(tmpdir(), "pi-swift-parser-failure-"));
    dirs.push(dir);
    const file = join(dir, "bad.swift");
    await writeFile(file, "class Broken {\n", "utf8");

    await expect(swiftMapper(file)).resolves.toBeNull();
    await expect(swiftMapper(file)).resolves.toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    await expect(swiftMapper(file)).resolves.toBeNull();
    expect(parser.delete).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledTimes(2);
    expect(String(error.mock.calls[0]![0])).toMatch(/^\[hashline-readmap\]/);
  });

  it("does not reject on truncated input when the real parser returns an error tree", async () => {
    vi.resetModules();
    const { swiftMapper } = await import("../src/readmap/mappers/swift.js");
    const dir = await mkdtemp(join(tmpdir(), "pi-swift-truncated-"));
    dirs.push(dir);
    const file = join(dir, "truncated.swift");
    await writeFile(file, "func broken( { let x = \n", "utf8");

    const result = await swiftMapper(file);
    expect(result === null || Array.isArray(result.symbols)).toBe(true);
  });


  it("returns null when a nested Swift declaration contains an error node", async () => {
    vi.resetModules();
    const { swiftMapper } = await import("../src/readmap/mappers/swift.js");
    const dir = await mkdtemp(join(tmpdir(), "pi-swift-error-tree-"));
    dirs.push(dir);
    const file = join(dir, "nested-error.swift");
    await writeFile(
      file,
      "class C { func before() {} BROKEN func after() {} }\n",
      "utf8",
    );

    await expect(swiftMapper(file)).resolves.toBeNull();
  });


  it("rejects malformed external macros beyond the known repeated-parse artifact", async () => {
    vi.resetModules();
    const { swiftMapper } = await import("../src/readmap/mappers/swift.js");
    const dir = await mkdtemp(join(tmpdir(), "pi-swift-bad-macro-"));
    dirs.push(dir);
    const file = join(dir, "bad-macro.swift");
    await writeFile(
      file,
      "macro broken() = #externalMacro(module: \"M\", type: @)\n",
      "utf8",
    );

    await expect(swiftMapper(file)).resolves.toBeNull();
  });

  it("returns null when the loader cannot provide a parser", async () => {
    vi.resetModules();
    vi.doMock("../src/readmap/parser-loader.js", () => ({
      getWasmParser: vi.fn(async () => null),
    }));

    const { swiftMapper } = await import("../src/readmap/mappers/swift.js");
    const dir = await mkdtemp(join(tmpdir(), "pi-swift-noparser-"));
    dirs.push(dir);
    const file = join(dir, "ok.swift");
    await writeFile(file, "class Fine { }\n", "utf8");

    await expect(swiftMapper(file)).resolves.toBeNull();
  });
});
