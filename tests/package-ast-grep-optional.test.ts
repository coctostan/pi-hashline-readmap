import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

describe("@ast-grep/cli packaging", () => {
  it("is not a hard dependency (its failing postinstall must not abort the parent install)", () => {
    expect(pkg.dependencies?.["@ast-grep/cli"]).toBeUndefined();
  });

  it("is declared under optionalDependencies so npm tolerates a missing prebuilt binary", () => {
    expect(pkg.optionalDependencies?.["@ast-grep/cli"]).toBe("0.42.2");
  });
});
