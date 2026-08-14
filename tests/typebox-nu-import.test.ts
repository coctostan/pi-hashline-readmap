import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = ["src/nu.ts"];

describe("nu TypeBox import", () => {
  it("uses the current typebox package", () => {
    const legacyImports = files.filter((path) =>
      readFileSync(path, "utf8").includes('from "@sinclair/typebox"'),
    );

    expect(legacyImports).toEqual([]);
  });
});
