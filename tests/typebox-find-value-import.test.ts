import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = ["tests/repro-233-find-ls-alignment.test.ts"];

describe("find TypeBox Value import", () => {
  it("uses the TypeBox 1.x value entry point", () => {
    const legacyImports = files.filter((path) =>
      readFileSync(path, "utf8").includes('from "@sinclair/typebox/value"'),
    );

    expect(legacyImports).toEqual([]);
  });
});
