import { beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { anchorBashGrepOutput } from "../src/bash-grep-anchors.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

const root = mkdtempSync(join(tmpdir(), "bash-grep-anchors-"));
const cwd = join(root, "repo");
mkdirSync(join(cwd, "src"), { recursive: true });
mkdirSync(join(root, "other"));
writeFileSync(join(cwd, "src/a.ts"), "alpha()\nbeta()\n");
writeFileSync(join(cwd, "src/b.ts"), "beta()\r\n");
writeFileSync(join(root, "other/c.ts"), "beta()\n");
const h = (line: string) => computeLineHash(0, line);

beforeAll(ensureHashInit);

describe("anchorBashGrepOutput", () => {
  it("anchors a path:N:content line that matches the file on disk", () => {
    const out = anchorBashGrepOutput("grep -rn beta src", "src/a.ts:2:beta()\nsrc/b.ts:1:beta()", cwd);
    expect(out.text).toBe(`src/a.ts:2:${h("beta()")}|beta()\nsrc/b.ts:1:${h("beta()")}|beta()`);
    expect([...out.files]).toEqual([
      [join(cwd, "src/a.ts"), [{ line: 2, hash: h("beta()") }]],
      [join(cwd, "src/b.ts"), [{ line: 1, hash: h("beta()") }]],
    ]);
  });

  it("leaves a changed line, a context line and a missing file alone", () => {
    const text = "src/a.ts-1-alpha()\nsrc/a.ts:2:beta() old\nsrc/a.ts:9:beta()\nsrc/a.ts:0:alpha()\nsrc/gone.ts:1:beta()\nsrc:1:beta()\n--";
    const out = anchorBashGrepOutput("grep -rn -C1 beta src", text, cwd);
    expect(out.text).toBe(text);
    expect(out.files.size).toBe(0);
  });

  it("leaves a path outside the cwd alone", () => {
    const text = `../other/c.ts:1:beta()\n${join(root, "other/c.ts")}:1:beta()`;
    const out = anchorBashGrepOutput("rg -n beta .. /", text, cwd);
    expect(out.text).toBe(text);
    expect(out.files.size).toBe(0);
  });

  it("anchors N:content when the command names exactly one file", () => {
    expect(anchorBashGrepOutput("grep -n beta src/a.ts", "2:beta()", cwd).text).toBe(`2:${h("beta()")}|beta()`);
    expect(anchorBashGrepOutput("rg -n beta src/a.ts src/b.ts", "2:beta()", cwd).text).toBe("2:beta()");
    expect(anchorBashGrepOutput("grep -rn beta src", "2:beta()", cwd).text).toBe("2:beta()");
  });

  it("tells the searched file from the pattern and option values", () => {
    const anchored = `2:${h("beta()")}|beta()`;
    // The pattern names an existing file, and so does an option's value: neither is searched.
    expect(anchorBashGrepOutput("grep -n src/b.ts src/a.ts", "2:beta()", cwd).text).toBe(anchored);
    expect(anchorBashGrepOutput("grep -n -C 1 -e src/b.ts src/a.ts", "2:beta()", cwd).text).toBe(anchored);
    expect(anchorBashGrepOutput("rg -n -g src/b.ts beta src/a.ts", "2:beta()", cwd).text).toBe(anchored);
    expect(anchorBashGrepOutput("rg -n --glob src/b.ts --regexp beta src/a.ts", "2:beta()", cwd).text).toBe(anchored);
    expect(anchorBashGrepOutput("grep -n -- -beta src/a.ts", "2:beta()", cwd).text).toBe(anchored);
    // Patterns from a file and input from stdin: no file operand at all.
    expect(anchorBashGrepOutput("grep -n -f src/a.ts < src/b.ts", "2:beta()", cwd).text).toBe("2:beta()");
  });

  it("leaves relative paths bare after a cd it cannot follow", () => {
    const out = anchorBashGrepOutput('cd "$DIR" && rg -n beta', "src/a.ts:2:beta()", cwd);
    expect(out.text).toBe("src/a.ts:2:beta()");
    const absolute = `${join(cwd, "src/a.ts")}:2:beta()`;
    expect(anchorBashGrepOutput('cd "$DIR" && rg -n beta', absolute, cwd).text).toBe(`${join(cwd, "src/a.ts")}:2:${h("beta()")}|beta()`);
    expect(anchorBashGrepOutput('cd "$DIR" && grep -n beta src/a.ts', "2:beta()", cwd).text).toBe("2:beta()");
  });

  it("resolves paths from the directory the grep runs in", () => {
    const out = anchorBashGrepOutput("cd src && rg -n beta", "a.ts:2:beta()", cwd);
    expect(out.text).toBe(`a.ts:2:${h("beta()")}|beta()`);
    expect([...out.files.keys()]).toEqual([join(cwd, "src/a.ts")]);
  });

  it("anchors only grep and rg results", () => {
    const out = anchorBashGrepOutput("echo 'src/a.ts:2:beta()'", "src/a.ts:2:beta()", cwd);
    expect(out.text).toBe("src/a.ts:2:beta()");
    expect(out.files.size).toBe(0);
  });
});
