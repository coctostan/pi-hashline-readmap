import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("long-line window documentation — overview", () => {
  it("README shows how to recover a clipped line", () => {
    const text = readFileSync("README.md", "utf8");
    expect(text).toContain("charOffset");
    expect(text).toContain("long line");
  });

  it("configuration docs say windowing is a per-call parameter, not a setting", () => {
    const text = readFileSync("docs/configuration.md", "utf8");
    expect(text).toContain("`charOffset`");
    expect(text).toContain("10,000");
    expect(text).toContain("`read.allowUnclipped`");
    expect(text).toContain("no Hashline setting");
  });

  it("CHANGELOG credits PR #219 and records the rejected unclipped flag", () => {
    const unreleased = readFileSync("CHANGELOG.md", "utf8").split("## [0.15.1]")[0];
    expect(unreleased).toContain("CrazyCoder");
    expect(unreleased).toContain("#219");
    expect(unreleased).toContain("`charOffset`");
    expect(unreleased).toContain("`unclipped`");
  });
});
