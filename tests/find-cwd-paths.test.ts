import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { _testable, isFdAvailable, registerFindTool } from "../src/find.js";

const fdInstalled = isFdAvailable();
let base: string;
let cwd: string;
let outside: string;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "find-cwd-paths-"));
  cwd = join(base, "work");
  outside = join(base, "outside");
  mkdirSync(join(cwd, "pkg", "sub"), { recursive: true });
  writeFileSync(join(cwd, "pkg", "sub", "view.ts"), "export const view = 1;\n");
  writeFileSync(join(cwd, "pkg", "index.ts"), "export * from './sub/view';\n");
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, "far.ts"), "export const far = 1;\n");
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

function findTool(): any {
  let captured: any;
  registerFindTool({ registerTool(def: any) { captured = def; } } as any);
  return captured;
}

async function find(params: Record<string, unknown>) {
  const result = await findTool().execute("tc", params, new AbortController().signal, undefined, { cwd });
  const text: string = result.content[0].text;
  const lines = text.split("\n").filter((line) => line && !line.startsWith("[") && !line.startsWith("Hint"));
  return { result, lines, paths: result.details.ptcValue.entries.map((entry: any) => entry.path) };
}

describe.each([
  ["node walk", false],
  ["fd", true],
] as const)("find names entries from the cwd (%s)", (_label, useFd) => {
  if (useFd && !fdInstalled) return it.skip("fd is not installed", () => {});
  afterEach(() => { _testable.isFdAvailable = isFdAvailable; });
  beforeAll(() => { _testable.fdHintShown = true; });
  const setFd = () => { _testable.isFdAvailable = () => useFd; };

  it("names entries under a relative path from the cwd, in text and entries", async () => {
    setFd();
    const { lines, paths } = await find({ pattern: "*.ts", path: "pkg" });
    expect(lines).toEqual(["pkg/index.ts", "pkg/sub/view.ts"]);
    expect(paths).toEqual(["pkg/index.ts", "pkg/sub/view.ts"]);
  });

  it("names entries the same for a nested, dotted or absolute path inside the cwd", async () => {
    setFd();
    for (const path of ["pkg/sub", "./pkg/sub/", join(cwd, "pkg", "sub")]) {
      expect((await find({ pattern: "view.ts", path })).paths).toEqual(["pkg/sub/view.ts"]);
    }
  });

  it("keeps cwd-relative entries when path is omitted", async () => {
    setFd();
    expect((await find({ pattern: "*.ts" })).paths).toEqual(["pkg/index.ts", "pkg/sub/view.ts"]);
  });

  it("gives an absolute path to an entry outside the cwd", async () => {
    setFd();
    const expected = join(outside, "far.ts");
    const { lines, paths } = await find({ pattern: "*.ts", path: "../outside" });
    expect(lines).toEqual([expected]);
    expect(paths).toEqual([expected]);
  });

  it("names directories from the cwd with a trailing slash in text", async () => {
    setFd();
    const { lines, paths } = await find({ pattern: "sub", path: "pkg", type: "dir" });
    expect(lines).toEqual(["pkg/sub/"]);
    expect(paths).toEqual(["pkg/sub"]);
  });

  it("names the cwd itself `.` when a parent root finds it", async () => {
    setFd();
    const { lines, paths } = await find({ pattern: "work", path: "..", type: "dir", maxDepth: 1 });
    expect(lines).toEqual(["./"]);
    expect(paths).toEqual(["."]);
  });

  it("keeps regex, stat filters, sort and limit working under a path", async () => {
    setFd();
    const { result, paths } = await find({
      pattern: "^v", regex: true, path: "pkg", sortBy: "size", minSize: 1,
    });
    expect(paths).toEqual(["pkg/sub/view.ts"]);
    expect(result.details.ptcValue.truncated).toBe(false);
    const limited = await find({ pattern: "*.ts", path: "pkg", sortBy: "size", reverse: true, limit: 1 });
    expect(limited.paths).toEqual(["pkg/index.ts"]);
    expect(limited.result.details.ptcValue.truncated).toBe(true);
  });
});
