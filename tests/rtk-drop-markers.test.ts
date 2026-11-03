import { describe, expect, it } from "vitest";
import { filterBashOutput } from "../src/rtk/bash-filter.ts";
import { compactDiff } from "../src/rtk/git.ts";
import { buildRtkCompaction } from "../src/rtk/rtk-compaction.ts";
import type { Drop } from "../src/rtk/drops.ts";

// Each marker docs/bash-output.md lists, read back as the drop it names.
const MARKERS = [
  /^ *\.\.\. and (\d+) more (\w+)$/,
  /^ {2}\.\.\. \((\d+) (context lines)\)$/,
  /^\[\.\.\. (\d+) more (lines)\]$/,
  /^Total: (\d+) (entries) in \d+ directories$/,
];

function markersIn(output: string) {
  return output.split("\n").flatMap((line) => {
    const match = MARKERS.map((marker) => line.match(marker)).find(Boolean);
    return match ? [{ count: Number(match[1]), unit: match[2] }] : [];
  });
}

function compact(command: string, raw: string) {
  const result = filterBashOutput(command, raw);
  const compaction = buildRtkCompaction({ rawInput: raw, ...result });
  expect(compaction.dropped).toEqual(markersIn(result.output));
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

  it("git diff reports exactly the context markers left beside the cap's cut, at every cap", () => {
    const hunk = [" a", " b", " c", " d", " e", "-x", "+y", " f", " g", " h", " i", " j"];
    const raw = text(lines(6, (f) => fileDiff(`f${f}`, hunk)).flat());
    for (let maxLines = 5; maxLines <= 90; maxLines++) {
      const drops: Drop[] = [];
      const output = compactDiff(raw, maxLines, drops);
      expect(drops, `maxLines ${maxLines}`).toEqual(markersIn(output));
    }
  });

  it("git diff past its line cap reports only the context markers it kept, beside the cap's own", () => {
    const raw = text(lines(30, (f) => fileDiff(`f${f}`, [" a", " b", " c", " d", " e", "-x", "+y"])).flat());
    const result = compact("git diff -U5", raw);

    expect(result.lines.filter((line) => line.includes("context lines")).length).toBeGreaterThan(0);
    expect(result.dropped.filter((drop) => drop.unit === "context lines").length).toBeLessThan(30);
    expect(result.dropped).toContainEqual({ count: expect.any(Number), unit: "lines" });
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

    expect(result.lines.filter((line) => line.startsWith("  ..."))).toEqual(["  ... and 1 more files", "  ... and 3 more files", "  ... and 2 more files"]);
    expect(result.lines[0]).toBe("📌 main...origin/main");
    expect(result.truncated).toBe(true);
  });

  it("build names the lines it cuts from a long error, and the errors past 5", () => {
    const error = (n: number, extra: number) => [`error[E0${n}]: bad ${n}`, ...lines(extra, (i) => `  --> src/x.rs:${i}`)];
    const raw = text([...error(2, 1), ...error(3, 1), ...error(4, 1), ...error(5, 1), ...error(6, 1), ...error(7, 1), ...error(1, 13)]);
    const result = compact("cargo build", raw);

    expect(result.output).toContain("... and 2 more errors");
    const shortErrors = compact("cargo build", text(lines(7, (n) => error(n, 1)).flat()));
    expect(shortErrors.lines).toContain("... and 2 more errors");
    expect(shortErrors.output).not.toContain("more lines");
    expect(shortErrors.truncated).toBe(true);
    const longFirst = text([...error(1, 13), ...error(2, 1)]);
    const first = compact("cargo build", longFirst);
    expect(first.lines).toContain("  ... and 4 more lines");
    expect(first.lines).not.toContain("  ...");
    expect(first.truncated).toBe(true);

    const longLast = compact("cargo build", text([...error(2, 1), ...error(1, 13)]));
    expect(longLast.lines).toContain("  ... and 4 more lines");
  });

  it("build names the lines it cuts from a long warning, and the warnings past 5, beside its errors", () => {
    const diagnostic = (kind: string, n: number, extra: number) => [`${kind}: unused ${n}`, ...lines(extra, (i) => `  --> src/x.rs:${i}`)];
    const warnings = [...diagnostic("warning", 1, 11), ...lines(6, (n) => diagnostic("warning", n + 2, 1)).flat()];
    const result = compact("cargo build", text([...diagnostic("error", 1, 12), ...warnings]));

    expect(result.lines).toContain("... and 2 more warnings");
    expect(result.dropped).toEqual([
      { count: 3, unit: "lines" },
      { count: 2, unit: "lines" },
      { count: 2, unit: "warnings" },
    ]);
    expect(result.truncated).toBe(true);
  });

  it("linter names the rules and files past its top 10", () => {
    const raw = text(lines(12, (i) => `src/f${i}.js:1:1: problem [rule-${i}]`));
    const result = compact("npx eslint .", raw);

    expect(result.lines).toContain("  ... and 2 more rules");
    expect(result.lines).toContain("  ... and 2 more files");
    expect(result.truncated).toBe(true);

    const eleven = compact("npx eslint .", text(lines(11, (i) => `src/f${i}.js:1:1: problem [rule-${i}]`)));
    expect(eleven.lines).toContain("  ... and 1 more rules");
    expect(eleven.lines).toContain("  ... and 1 more files");
    const ten = compact("npx eslint .", text(lines(10, (i) => `src/f${i}.js:1:1: problem [rule-${i}]`)));
    expect(ten.output).not.toContain("more");
    expect(ten.truncated).toBe(false);

    const oneFile = compact("npx eslint .", text(lines(12, (i) => `src/f.js:${i + 1}:1: problem [rule-${i}]`)));
    expect(oneFile.lines).toContain("  ... and 2 more rules");
    expect(oneFile.output).not.toContain("more files");
    expect(oneFile.truncated).toBe(true);
  });

  it("find's summary counts entries, directories included, and sets truncated", () => {
    const raw = text(["src", "tests", ...lines(74, (i) => `src/a${i}.ts`), ...lines(74, (i) => `tests/b${i}.ts`)]);
    const result = compact("find src tests -maxdepth 1", raw);

    expect(result.lines).toContain("src/ (74 entries)");
    expect(result.lines).toContain("Total: 150 entries in 3 directories");
    expect(result.truncated).toBe(true);
  });

  it("find keeps diagnostics-only output unchanged, since no entry is dropped", () => {
    const raw = text(lines(120, (i) => `find: '/missing${i}': No such file or directory`));
    const result = compact("find /missing* || true", raw);

    expect(result.output.startsWith(raw)).toBe(true);
    expect(result).toMatchObject({ applied: false, truncated: false });
  });

  it.each([
    ["find src -ls", (i: number) => `  ${1000 + i}      8 -rw-r--r--   1 me  staff  120 Nov  2 10:00 src/a${i}.ts`],
    ["find src -printf '%s %p\\n'", (i: number) => `120 src/a${i}.ts`],
    ["find src -exec eslint -f unix {} \\;", (i: number) => `src/a${i}.js:1:1: problem [rule-${i % 3}]`],
    ["LC_ALL=C find src -exec eslint -f unix {} \\;", (i: number) => `src/a${i}.js:1:1: problem [rule-${i % 3}]`],
  ])("%s passes through uncompacted, since its lines are no bare paths", (command, row) => {
    const raw = text(lines(150, row));
    const result = compact(command, raw);

    expect(result.output.startsWith(raw)).toBe(true);
    expect(result).toMatchObject({ technique: "none", applied: false, truncated: false });
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

// Ruling 0006: a route drops silently only the noise docs/bash-output.md names for it. Each fixture below holds that
// noise, the lines whose text must stay visible (`shown`), and any lines a budget cuts, which `dropped` must count.
const ROUTES: { route: string; command: string; raw: string[]; shown: string[]; dropped: Drop[] }[] = [
  {
    route: "git diff",
    command: "git diff -M",
    raw: [
      "warning: in the working copy of 'a.txt', LF will be replaced by CRLF the next time Git touches it",
      ...["diff --git a/old.ts b/new.ts", "similarity index 90%", "rename from old.ts", "rename to new.ts"],
      ...["index 1111111..2222222 100644", "--- a/old.ts", "+++ b/new.ts", "@@ -1 +1 @@", "-old line", "+new line"],
      ...["diff --git a/run.sh b/run.sh", "old mode 100644", "new mode 100755"],
      ...["diff --git a/logo.png b/logo.png", "index 3333333..4444444 100644", "Binary files a/logo.png and b/logo.png differ"],
      ...["diff --git a/added.ts b/added.ts", "new file mode 100644", "index 0000000..5555555", "--- /dev/null", "+++ b/added.ts"],
      ...["@@ -0,0 +1 @@", "+first", "\\ No newline at end of file"],
    ],
    shown: [
      "warning: in the working copy of 'a.txt', LF will be replaced by CRLF the next time Git touches it",
      ...["📄 new.ts", "similarity index 90%", "rename from old.ts", "rename to new.ts", "@@ -1 +1 @@", "-old line", "+new line"],
      ...["📄 run.sh", "old mode 100644", "new mode 100755", "📄 logo.png", "Binary files a/logo.png and b/logo.png differ"],
      ...["📄 added.ts", "new file mode 100644", "@@ -0,0 +1 @@", "+first"],
    ],
    dropped: [],
  },
  {
    route: "git status",
    command: "git status --short --branch",
    raw: ["## main", "T  index-type.ts", " T worktree-type.ts", " R worktree-rename.ts", " A intent-to-add.ts", "!! ignored.log"],
    shown: ["📌 main", "index-type.ts", "worktree-type.ts", "worktree-rename.ts", "intent-to-add.ts", "ignored.log"],
    dropped: [],
  },
  {
    route: "linter",
    command: "npx eslint -f unix .",
    raw: [...lines(5, (i) => `/src/a.js:${i + 1}:1: problem ${i} [Error/rule-${i}]`), "/src/b.js:1:1: problem [Error/rule-0]", "", "6 problems"],
    // The findings are counted, each in its file's and its rule's count; the 2 rules past a.js's top 3 in the marker.
    shown: ["6 errors, 0 warnings in 2 files", "/src/a.js (5 issues)", "/src/b.js (1 issues)", "Error/rule-0 (2x)", "6 problems"],
    dropped: [{ count: 2, unit: "rules" }],
  },
  {
    route: "build-tools",
    command: "./gradlew build || true",
    raw: [...lines(10, (i) => `> Task :step${i} UP-TO-DATE`), "> Task :test FAILED", "FAILURE: Build failed with an exception.", "BUILD FAILED in 3s"],
    shown: ["> Task :test FAILED", "FAILURE: Build failed with an exception.", "BUILD FAILED in 3s"],
    dropped: [],
  },
  {
    route: "build",
    command: "npm run build",
    raw: ["", "> app@1.0.0 build", "> tsc", "", "src/a.ts(1,7): warning TS6133: 'x' is declared but its value is never read.", "", "Found 1 warning."],
    shown: ["> app@1.0.0 build", "> tsc", "src/a.ts(1,7): warning TS6133: 'x' is declared but its value is never read.", "Found 1 warning."],
    dropped: [],
  },
  {
    route: "package-manager",
    command: "npm install",
    raw: [
      ...lines(8, (i) => `npm http fetch GET 200 https://registry.npmjs.org/pkg${i} 12ms`),
      ...["npm warn deprecated inflight@1.0.6: This module is not supported", "", "added 12 packages, and audited 13 packages in 2s", ""],
      ...["3 packages are looking for funding", "  run `npm fund` for details", "", "found 0 vulnerabilities"],
    ],
    shown: [
      ...["npm warn deprecated inflight@1.0.6: This module is not supported", "added 12 packages, and audited 13 packages in 2s"],
      ...["3 packages are looking for funding", "run `npm fund` for details", "found 0 vulnerabilities"],
    ],
    dropped: [],
  },
  {
    route: "docker",
    command: "docker build .",
    raw: [
      ...["Sending build context to Docker daemon  2.048kB", "Step 1/2 : FROM node:20", " ---> 0123456789ab", "Step 2/2 : RUN npm install"],
      ...[" ---> Running in abc123def456", "npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported"],
      ...["added 142 packages in 3s", "Removing intermediate container abc123def456", " ---> 0123456789cd", ""],
      ...["Successfully built 0123456789cd", "Successfully tagged app:latest"],
    ],
    shown: [
      ...["Step 1/2 : FROM node:20", "Step 2/2 : RUN npm install", "added 142 packages in 3s"],
      ...["npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported"],
      ...["Successfully built 0123456789cd", "Successfully tagged app:latest"],
    ],
    dropped: [],
  },
  {
    route: "file-listing",
    command: "find . -name '*.ts'",
    raw: [...lines(150, (i) => `./src/a${i}.ts`), "find: './private': Permission denied"],
    shown: ["find: './private': Permission denied", "./src/ (150 entries)"],
    dropped: [{ count: 150, unit: "entries" }],
  },
  {
    route: "http-client",
    command: "curl -i https://x",
    raw: [
      "  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current",
      "100  1234  100  1234    0     0   5678      0 --:--:-- --:--:-- --:--:--  5678",
      ...["HTTP/1.1 200 OK", "Content-Type: text/plain", "", ...lines(250, (i) => `row ${i}`)],
    ],
    shown: ["HTTP/1.1 200 OK", "Content-Type: text/plain", "row 0", "row 199"],
    dropped: [{ count: 50, unit: "lines" }],
  },
  {
    route: "transfer",
    command: "rsync -av src/ dst/",
    raw: [
      ...["sending incremental file list", "./", ...lines(12, (i) => `f${i}.txt`), ""],
      ...["sent 1,234 bytes  received 56 bytes  2,580.00 bytes/sec", "total size is 1,000  speedup is 0.78"],
    ],
    // `./` and f0–f8 fill the budget of 10; f9–f11 are counted.
    shown: [...lines(9, (i) => `f${i}.txt`), "sent 1,234 bytes  received 56 bytes", "total size is 1,000  speedup is 0.78"],
    dropped: [{ count: 3, unit: "files" }],
  },
];

describe("every route drops only its noise silently", () => {
  it.each(ROUTES)("$route keeps or counts each line but its noise", ({ command, raw, shown, dropped }) => {
    const result = compact(command, text(raw));

    expect(result.applied).toBe(true);
    expect(shown.filter((line) => !result.output.includes(line))).toEqual([]);
    expect(result.dropped).toEqual(dropped);
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
