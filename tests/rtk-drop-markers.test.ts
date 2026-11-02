import { describe, expect, it } from "vitest";
import { filterBashOutput } from "../src/rtk/bash-filter.ts";
import { compactDiff } from "../src/rtk/git.ts";
import { buildRtkCompaction } from "../src/rtk/rtk-compaction.ts";

function compact(command: string, raw: string) {
  const result = filterBashOutput(command, raw);
  const compaction = buildRtkCompaction({ rawInput: raw, output: result.output, compacted: result.compacted, info: result.info });
  return { output: result.output, lines: result.output.split("\n"), technique: result.info.technique, ...compaction };
}

const lines = <T>(count: number, make: (i: number) => T): T[] => Array.from({ length: count }, (_, i) => make(i));
const text = (rows: string[]) => `${rows.join("\n")}\n`;

function fileDiff(name: string, changes: string[]): string[] {
  return [`diff --git a/${name} b/${name}`, `--- a/${name}`, `+++ b/${name}`, `@@ -1,1 +1,${changes.length} @@`, ...changes];
}

describe("budget cuts end in a marker naming the true count, and set truncated", () => {
  it("git diff past its line cap counts the dropped output lines, file headers included", () => {
    const raw = text(lines(40, (i) => fileDiff(`f${i}`, ["-old", "+new"])).flat());
    const uncapped = compactDiff(raw, Number.POSITIVE_INFINITY).split("\n");
    const result = compact("git diff", raw);

    const marker = result.lines.find((line) => line.startsWith("..."));
    expect(marker).toBe(`... and ${uncapped.length - (result.lines.length - 1)} more lines`);
    expect(uncapped).toHaveLength(240);
    expect(marker).toBe("... and 142 more lines");
    expect(result.truncated).toBe(true);
  });

  it("git diff cutting changes across files counts every line it drops", () => {
    const raw = text(lines(3, (f) => fileDiff(`f${f}`, lines(40, (i) => `+line ${i}`))).flat());
    const uncapped = compactDiff(raw, Number.POSITIVE_INFINITY).split("\n");
    const result = compact("git diff", raw);

    const marker = result.lines.find((line) => line.startsWith("..."));
    expect(marker).toBe(`... and ${uncapped.length - (result.lines.length - 1)} more lines`);
    expect(result.truncated).toBe(true);
  });

  it("git diff -U5 names the context lines it cuts past 3 per side, and sets truncated", () => {
    const raw = text(fileDiff("f", [..." a b c d e".split(" ").slice(1).map((c) => ` ${c}`), "-x", "+y", ..." f g h i j".split(" ").slice(1).map((c) => ` ${c}`)]));
    const result = compact("git diff -U5", raw);

    expect(result.lines.filter((line) => line.includes("context lines"))).toEqual(["  ... (2 context lines)", "  ... (2 context lines)"]);
    expect(result.truncated).toBe(true);
  });

  it("git diff with 3 context lines and a trailing newline cuts nothing", () => {
    const raw = text(fileDiff("f", [" a", " b", " c", "-x", "+y", " d", " e", " f"]));
    const result = compact("git diff", raw);

    expect(result.output).not.toContain("context lines");
    expect(result.lines.at(-1)).toBe("  +1 -1");
    expect(result.truncated).toBe(false);
  });

  it("git status names the files past each list's cut", () => {
    const raw = text(["## main...origin/main", ...lines(8, (i) => ` M f${i}`), ...lines(6, (i) => `M  s${i}`), ...lines(5, (i) => `?? u${i}`)]);
    const result = compact("git status --short --branch", raw);

    expect(result.lines.filter((line) => line.includes("..."))).toEqual(["  ... and 1 more files", "  ... and 3 more files", "  ... and 2 more files"]);
    expect(result.truncated).toBe(true);
  });

  it("build names the lines it cuts from a long error, and the errors past 5", () => {
    const error = (n: number, extra: number) => [`error[E0${n}]: bad ${n}`, ...lines(extra, (i) => `  --> src/x.rs:${i}`)];
    const raw = text([...error(2, 1), ...error(3, 1), ...error(4, 1), ...error(5, 1), ...error(6, 1), ...error(7, 1), ...error(1, 13)]);
    const result = compact("cargo build", raw);

    expect(result.output).toContain("... and 2 more errors");
    const longFirst = text([...error(1, 13), ...error(2, 1)]);
    const first = compact("cargo build", longFirst);
    expect(first.lines).toContain("  ... and 4 more lines");
    expect(first.lines).not.toContain("  ...");
    expect(first.truncated).toBe(true);

    const longLast = compact("cargo build", text([...error(2, 1), ...error(1, 13)]));
    expect(longLast.lines).toContain("  ... and 4 more lines");
  });

  it("linter names the rules and files past its top 10", () => {
    const raw = text(lines(12, (i) => `src/f${i}.js:1:1: problem [rule-${i}]`));
    const result = compact("npx eslint .", raw);

    expect(result.lines).toContain("  ... and 2 more rules");
    expect(result.lines).toContain("  ... and 2 more files");
    expect(result.truncated).toBe(true);
  });

  it("find's summary counts entries, directories included, and sets truncated", () => {
    const raw = text(["src", "tests", ...lines(74, (i) => `src/a${i}.ts`), ...lines(74, (i) => `tests/b${i}.ts`)]);
    const result = compact("find src tests -maxdepth 1", raw);

    expect(result.lines).toContain("src/ (74 entries)");
    expect(result.lines).toContain("Total: 150 entries in 3 directories");
    expect(result.truncated).toBe(true);
  });

  it("http-client counts the body lines it cuts, not the trailing newline", () => {
    const body = lines(250, (i) => `{"i": ${i}}`);
    expect(compact("curl -s https://x", text(body)).lines.at(-1)).toBe("[... 50 more lines]");

    const withHeaders = compact("curl -i https://x", text(["HTTP/1.1 200 OK", "Content-Type: application/json", "", ...body]));
    expect(withHeaders.lines.at(-1)).toBe("[... 50 more lines]");
    expect(withHeaders.truncated).toBe(true);
  });

  it("http-client keeps a short response, trailing newline included, unchanged", () => {
    const raw = text(["HTTP/1.1 200 OK", "Content-Type: text/plain", "", ...lines(20, (i) => `row ${i}`)]);
    const result = compact("curl -i https://x", raw);

    expect(result.output).toBe(raw);
    expect(result.applied).toBe(false);
  });
});

describe("listings whose entries can't be counted pass through", () => {
  it("leaves a large ls -R unchanged", () => {
    const raw = text([".:", "a", "b", "", "./a:", ...lines(60, (i) => `x${i}`), "", "./b:", ...lines(50, (i) => `y${i}`)]);
    const result = compact("ls -R", raw);

    expect(result.output).toBe(raw);
    expect(result.applied).toBe(false);
  });

  it("leaves a large tree unchanged", () => {
    const raw = text([".", "└── a", ...lines(110, (i) => `    ├── x${i}`), "", "1 directory, 110 files"]);
    const result = compact("tree", raw);

    expect(result.output).toBe(raw);
    expect(result.applied).toBe(false);
  });
});

describe("noise filters set nothing", () => {
  it("docker build dropping intermediate-container noise is applied, not truncated", () => {
    const raw = text(["Sending build context to Docker daemon  2.048kB", ...lines(6, (i) => [`Step ${i + 1}/6 : RUN echo ${i}`, " ---> Running in abc123def456", "Removing intermediate container abc123def456", " ---> 0123456789ab"]).flat(), "Successfully built 0123456789ab"]);
    const result = compact("docker build .", raw);

    expect(result.applied).toBe(true);
    expect(result.truncated).toBe(false);
  });

  it("npm install dropping progress lines is applied, not truncated", () => {
    const raw = text([...lines(12, (i) => `npm http fetch GET 200 https://registry.npmjs.org/pkg${i} 12ms`), "added 12 packages in 2s"]);
    const result = compact("npm install", raw);

    expect(result.applied).toBe(true);
    expect(result.truncated).toBe(false);
  });

  it("curl dropping its progress meter is applied, not truncated", () => {
    const raw = text([
      "  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current",
      "                                 Dload  Upload   Total   Spent    Left  Speed",
      "100  1234  100  1234    0     0   5678      0 --:--:-- --:--:-- --:--:--  5678",
      ...lines(12, (i) => `row ${i}`),
    ]);
    const result = compact("curl https://x", raw);

    expect(result.applied).toBe(true);
    expect(result.truncated).toBe(false);
  });
});
