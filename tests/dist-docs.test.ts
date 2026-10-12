import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dist build documentation (#267)", () => {
  it("AGENTS.md states the build contract and why dist/package.json is commonjs", () => {
    const text = readFileSync("AGENTS.md", "utf8");
    expect(text).toContain("## Build contract");
    expect(text).toContain('`{"type":"commonjs"}`');
    expect(text).toContain("undocumented jiti");
    expect(text).toContain("alias map");
    expect(text).toContain("tests/pi-host-dist-entry.test.ts");
    expect(text).toContain("index.ts");
  });

  it("README's development section documents npm run build", () => {
    const text = readFileSync("README.md", "utf8");
    expect(text).toContain("npm run build");
    expect(text).toContain("dist/");
  });

  it("CHANGELOG credits PR #226", () => {
    const unreleased = readFileSync("CHANGELOG.md", "utf8").split("## [0.15.1]")[0];
    expect(unreleased).toContain("#226");
    expect(unreleased).toContain("valentinoPereira");
    expect(unreleased).toContain("dist/index.js");
  });
});
