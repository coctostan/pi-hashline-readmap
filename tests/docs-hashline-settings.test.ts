import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
describe("Hashline settings documentation", () => {
  it("keeps exploratory verification and native settings reference", async () => {
    const exploratory = await readFile("docs/exploratory-functional-testing.md", "utf8");
    const configuration = await readFile("docs/configuration.md", "utf8");
    expect(exploratory).toContain("JSON settings verification procedure:");
    expect(exploratory).toContain("confirm it overrides the global JSON value");
    expect(exploratory).toContain("confirm the env value wins");
    expect(configuration).toContain("~/.pi/agent/hashline-readmap/settings.json");
    expect(configuration).toContain("<repo>/.pi/hashline-readmap/settings.json");
    expect(configuration).toContain("environment variables > project JSON > global JSON > built-in defaults");
    expect(configuration).toContain("edit.diffDisplay"); expect(configuration).toContain("PI_HASHLINE_SHELL_PATH"); expect(configuration).toContain("PI_HASHLINE_GDSCRIPT=1");
  });
});
