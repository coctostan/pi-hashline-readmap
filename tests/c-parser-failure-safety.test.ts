import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const dirs: string[] = [];
afterEach(async () => {
  delete process.env.PI_HASHLINE_READMAP_DEBUG;
  vi.restoreAllMocks();
  vi.doUnmock("../src/readmap/parser-loader.js");
  vi.resetModules();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("C WASM parser failure safety", () => {
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

    const { cMapper } = await import("../src/readmap/mappers/c.js");
    const dir = await mkdtemp(join(tmpdir(), "pi-c-parser-failure-"));
    dirs.push(dir);
    const file = join(dir, "bad.c");
    await writeFile(file, "int main() {\n", "utf8");

    await expect(cMapper(file)).resolves.toBeNull();
    await expect(cMapper(file)).resolves.toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    await expect(cMapper(file)).resolves.toBeNull();
    expect(parser.delete).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledTimes(2);
    expect(String(error.mock.calls[0]![0])).toMatch(/^\[hashline-readmap\]/);

    const source = readFileSync(resolve("src/readmap/mappers/c.ts"), "utf8");
    expect(source).toContain(
      "`wasm:parse:c:${err instanceof Error ? err.message : String(err)}`",
    );
  });


  it("returns null for real parser error trees instead of a corrupted Full map", async () => {
    vi.resetModules();
    const { cMapper } = await import("../src/readmap/mappers/c.js");
    const dir = await mkdtemp(join(tmpdir(), "pi-c-error-tree-"));
    dirs.push(dir);
    const file = join(dir, "recovered.c");
    await writeFile(
      file,
      "int before;\nthis is not C !!!\nint after(void);\n",
      "utf8",
    );

    await expect(cMapper(file)).resolves.toBeNull();
  });

  it("returns null when the loader cannot provide a parser", async () => {
    vi.resetModules();
    vi.doMock("../src/readmap/parser-loader.js", () => ({
      getWasmParser: vi.fn(async () => null),
    }));

    const { cMapper } = await import("../src/readmap/mappers/c.js");
    const dir = await mkdtemp(join(tmpdir(), "pi-c-noparser-"));
    dirs.push(dir);
    const file = join(dir, "ok.c");
    await writeFile(file, "int add(int a) { return a; }\n", "utf8");

    await expect(cMapper(file)).resolves.toBeNull();
  });
});
