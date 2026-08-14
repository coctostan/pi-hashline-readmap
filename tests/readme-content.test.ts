import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const readme = readFileSync("README.md", "utf8");
const firstScreen = readme.split("\n").filter((line) => line.trim()).slice(0, 40).join("\n");
function proseWords(markdown: string): number {
  const prose = markdown.replace(/```[\s\S]*?```/g, " ").split("\n").filter((line) => !/^\s*\|/.test(line)).filter((line) => !/^\s*!?\[[^\]]*\]\([^)]*\)\s*$/.test(line)).join("\n").replace(/\]\([^)]*\)/g, "]").replace(/<https?:\/\/[^>]+>/g, " ");
  return prose.match(/\b[\p{L}\p{N}][\p{L}\p{N}'’+./:-]*\b/gu)?.length ?? 0;
}
describe("README new-user path", () => {
  it("puts purpose, install, tools, and anchor demo before advanced material", () => {
    expect(firstScreen).toContain("pi install npm:pi-hashline-readmap");
    for (const tool of ["`read`", "`edit`", "`grep`", "`ls`", "`find`", "`ast_search`", "`write`", "`nu`", "`bash`"]) expect(firstScreen, tool).toContain(tool);
    expect(firstScreen).toContain("replaces Pi's `read`, `edit`, `grep`, `write`, `ls`, and `find`");
    const demo = readme.indexOf("## 30-second read/edit"); expect(demo).toBeGreaterThan(-1);
    const demoEnd = readme.indexOf("## Why use it?", demo);
    const demoText = readme.slice(demo, demoEnd);
    expect(demoText).toContain('write({ path: "hashline-demo.txt", content: "hello, hashline!\\n" })');
    expect(demoText).toContain('read({ path: "hashline-demo.txt" })');
    expect(demoText).toContain('path: "hashline-demo.txt"');
    expect(demoText).toContain('anchor: "1:f0c"');
    expect(demoText).not.toContain("tests/fixtures/");
    expect(readme.indexOf("edit({", demo)).toBeGreaterThan(demo);
    for (const later of ["## Configuration", "## Bash output", "## Structured output and integrations", "## Context hygiene", "## Development"]) expect(readme.indexOf(later), later).toBeGreaterThan(demo);
    expect(proseWords(readme)).toBeLessThanOrEqual(1250);
  });
  it("links extracted references and documents post-248 composition", () => {
    for (const path of ["docs/bash-output.md", "docs/context-hygiene.md", "docs/integrations.md", "docs/structured-output.md", "docs/configuration.md", "docs/tool-metadata.md"]) expect(readme).toContain(`](${path})`);
    expect(readme).toContain("Advanced behavior and integration contracts are documented in the references below.");
    expect(readme).toContain('symbol: "registerReadTool", limit: 80'); expect(readme).toContain('symbol: "createDemoDirectory", map: true'); expect(readme).toContain('bundle: "local", map: true');
    expect(readme).toContain("`symbol+offset` is invalid"); expect(readme).toContain("bundle without `symbol` is invalid");
    expect(readme).toContain("git clone https://github.com/coctostan/pi-hashline-readmap.git");
    expect(readme).toContain("docs/exploratory-functional-testing.md");
    expect(readme).toContain("  readmap/                # structural mapping and symbol lookup");
    expect(readme).toContain("Truncated full-file reads append a map");
    expect(readme).toContain("one coordinated extension");
    for (const url of ["https://github.com/nicholasgasior/pi-hashline-edit", "https://github.com/nicholasgasior/pi-read-map", "https://github.com/PurpleMyst/pi-repo-map", "https://github.com/mcowger/pi-rtk"]) expect(readme).toContain(url);
    expect(existsSync("docs/readme-simplification-analysis.md")).toBe(false);
  });
});
