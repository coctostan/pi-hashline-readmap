import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStaleCodeCheck, staleCodeFiles } from "../src/stale-code.js";

// In the past, so the directories the fixture creates are newer than the load: only files may count.
const LOADED_AT = Date.now() - 3_600_000;
const BEFORE = new Date(LOADED_AT - 60_000);

let root: string;

function file(path: string, at: Date = BEFORE): void {
  const abs = join(root, path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, "x\n");
  utimesSync(abs, at, at);
}

function change(path: string, secondsAfterLoad: number): void {
  const at = new Date(LOADED_AT + secondsAfterLoad * 1000);
  utimesSync(join(root, path), at, at);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "stale-code-"));
  for (const path of ["index.ts", "src/read.ts", "src/readmap/mapper.ts", "prompts/read.md", "tests/a.test.ts", "docs/a.md", "scripts/a.mjs", "dist/index.js"]) file(path);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("staleCodeFiles (source layout)", () => {
  const entry = () => join(root, "index.ts");

  it("finds nothing when no loaded file changed", () => {
    expect(staleCodeFiles(root, entry(), LOADED_AT)).toBeUndefined();
  });

  it("counts changed index.ts, src/** and prompts/** files and names the newest", () => {
    change("index.ts", 5);
    change("src/readmap/mapper.ts", 30);
    change("prompts/read.md", 10);
    expect(staleCodeFiles(root, entry(), LOADED_AT)).toEqual({ count: 3, newest: "src/readmap/mapper.ts" });
  });

  it("ignores files the running code did not come from", () => {
    for (const path of ["tests/a.test.ts", "docs/a.md", "scripts/a.mjs", "dist/index.js"]) change(path, 5);
    expect(staleCodeFiles(root, entry(), LOADED_AT)).toBeUndefined();
  });

  it("counts a file modified after the load, not one modified at it", () => {
    change("src/read.ts", 0);
    expect(staleCodeFiles(root, entry(), LOADED_AT)).toBeUndefined();
    change("src/read.ts", 0.001);
    expect(staleCodeFiles(root, entry(), LOADED_AT)).toEqual({ count: 1, newest: "src/read.ts" });
  });

  it("tolerates a missing watched directory", () => {
    rmSync(join(root, "prompts"), { recursive: true });
    change("src/read.ts", 5);
    expect(staleCodeFiles(root, entry(), LOADED_AT)).toEqual({ count: 1, newest: "src/read.ts" });
  });
});

describe("createStaleCodeCheck", () => {
  const check = () => createStaleCodeCheck({ root, entry: join(root, "index.ts"), loadedAt: LOADED_AT });

  it("warns at new, resume and fork with the count, the newest file and /reload", () => {
    change("src/read.ts", 5);
    change("prompts/read.md", 9);
    const warn = check();
    for (const [reason, id] of [["new", "s1"], ["resume", "s2"], ["fork", "s3"]]) {
      const message = warn(reason, id);
      expect(message).toContain("2 files");
      expect(message).toContain("prompts/read.md");
      expect(message).toContain("/reload");
    }
  });

  it("checks nothing at startup or reload", () => {
    change("src/read.ts", 5);
    const warn = check();
    expect(warn("startup", "s1")).toBeUndefined();
    expect(warn("reload", "s1")).toBeUndefined();
  });

  it("warns a session at most once", () => {
    change("src/read.ts", 5);
    const warn = check();
    expect(warn("new", "s1")).toContain("1 file,");
    expect(warn("new", "s1")).toBeUndefined();
    expect(warn("new", "s2")).toContain("src/read.ts");
  });

  it("stays silent when nothing changed", () => {
    expect(check()("new", "s1")).toBeUndefined();
  });
});
