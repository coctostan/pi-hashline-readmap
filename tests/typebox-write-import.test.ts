import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = ["src/write.ts"];

describe("write TypeBox import", () => {
  it("uses the current typebox package", () => {
    const legacyImports = files.filter((path) =>
      readFileSync(path, "utf8").includes('from "@sinclair/typebox"'),
    );

    expect(legacyImports).toEqual([]);
  });
});
