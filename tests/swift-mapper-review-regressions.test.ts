import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { swiftMapper } from "../src/readmap/mappers/swift.js";

async function mapSwiftSource(source: string) {
  const dir = await mkdtemp(join(tmpdir(), "swift-review-regressions-"));
  const file = join(dir, "review.swift");
  try {
    await writeFile(file, source, "utf8");
    return await swiftMapper(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("Swift mapper review regressions", () => {
  it("rejects error-recovery trees instead of returning a corrupted partial hierarchy", async () => {
    const map = await mapSwiftSource(
      "struct S {\n" +
        "#if FEATURE\n" +
        "  func guarded() {}\n" +
        "#else\n" +
        "  func alternative() {}\n" +
        "#endif\n" +
        "  func visible() {}\n" +
        "}\n",
    );

    expect(map).toBeNull();
  });

  it("uses the AST body boundary when a declaration contains an earlier brace", async () => {
    const map = await mapSwiftSource(
      "func configure(handler: () -> Void = {}) { handler() }\n",
    );

    expect(map?.symbols[0]?.signature).toBe(
      "func configure(handler: () -> Void = {})",
    );
  });

  it("keeps the full nested type name for extensions", async () => {
    const map = await mapSwiftSource(
      "extension Outer.Inner { func nestedMethod() {} }\n",
    );

    expect(map?.symbols[0]?.name).toBe("Outer.Inner");
  });

  it("does not describe C or Swift registry entries as regex-backed", () => {
    const source = readFileSync(resolve("src/readmap/mapper.ts"), "utf8");
    expect(source).not.toContain(".c files use regex");
    expect(source).not.toContain("Swift regex mapper");
  });
});
