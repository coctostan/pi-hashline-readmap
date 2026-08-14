import { afterEach, describe, expect, it, vi } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Value } from "typebox/value";
import { _testable, isFdAvailable, registerFindTool } from "../src/find.js";
import { registerLsTool } from "../src/ls.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readdir: vi.fn(actual.readdir) };
});

function getFindTool() {
  let captured: any;
  registerFindTool({ registerTool(def: any) { captured = def; } } as any);
  if (!captured) throw new Error("find tool was not registered");
  return captured;
}

function getLsTool() {
  let captured: any;
  registerLsTool({ registerTool(def: any) { captured = def; } } as any);
  if (!captured) throw new Error("ls tool was not registered");
  return captured;
}

function execute(tool: any, params: Record<string, unknown>, cwd: string) {
  return tool.execute(
    "repro-233",
    params,
    new AbortController().signal,
    undefined,
    { cwd },
  );
}

const originalIsFdAvailable = isFdAvailable;

afterEach(() => {
  _testable.isFdAvailable = originalIsFdAvailable;
});

describe("issue 233 find/ls alignment regressions", () => {
  it.skipIf(!originalIsFdAvailable())("find fd traversal excludes .git with node-backend parity", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repro-233-find-git-"));
    try {
      mkdirSync(join(dir, ".git", "logs"), { recursive: true });
      writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
      writeFileSync(join(dir, ".git", "logs", "HEAD"), "log\n");
      const tool = getFindTool();

      for (const regex of [false, true]) {
        _testable.isFdAvailable = () => false;
        const nodeResult = await execute(tool, { pattern: "HEAD", regex }, dir);
        _testable.isFdAvailable = () => true;
        const fdResult = await execute(tool, { pattern: "HEAD", regex }, dir);

        expect(fdResult.details.ptcValue.entries).toEqual(nodeResult.details.ptcValue.entries);
        expect(fdResult.details.ptcValue.entries).toEqual([]);
      }

      mkdirSync(join(dir, ".hidden-dir"), { recursive: true });
      writeFileSync(join(dir, ".hidden-dir", "visible.txt"), "visible\n");
      writeFileSync(join(dir, ".hidden-file"), "hidden\n");
      mkdirSync(join(dir, "ignored"), { recursive: true });
      writeFileSync(join(dir, "ignored", "ignored.txt"), "ignored\n");
      writeFileSync(join(dir, ".gitignore"), "ignored/\n");
      mkdirSync(join(dir, "nested"), { recursive: true });
      writeFileSync(join(dir, "nested", ".gitignore"), "*.tmp\n");
      writeFileSync(join(dir, "nested", "skipped.tmp"), "ignored\n");
      writeFileSync(join(dir, "nested", "kept.txt"), "kept\n");

      let anyPaths: string[] = [];
      const parityQueries = [
        { pattern: "*", type: "dir" },
        { pattern: "*", type: "any" },
        { pattern: ".*", regex: true, type: "any" },
      ];
      for (const params of parityQueries) {
        _testable.isFdAvailable = () => false;
        const nodeResult = await execute(tool, params, dir);
        _testable.isFdAvailable = () => true;
        const fdResult = await execute(tool, params, dir);

        const nodePaths = nodeResult.details.ptcValue.entries.map(
          (entry: any) => entry.path,
        );
        const fdPaths = fdResult.details.ptcValue.entries.map(
          (entry: any) => entry.path,
        );
        expect(fdPaths).toEqual(nodePaths);
        expect(
          fdPaths.some(
            (path: string) => path === ".git" || path.startsWith(".git/"),
          ),
        ).toBe(false);
        if (params.type === "any" && !params.regex) anyPaths = fdPaths;
      }

      expect(anyPaths).toContain(".hidden-dir");
      expect(anyPaths).toContain(".hidden-dir/visible.txt");
      expect(anyPaths).toContain(".hidden-file");
      expect(anyPaths).toContain("nested/kept.txt");
      expect(anyPaths).not.toContain("ignored/ignored.txt");
      expect(anyPaths).not.toContain("nested/skipped.tmp");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("find validates and canonicalizes positive integer limits", async () => {
    const tool = getFindTool();
    expect(Value.Check(tool.parameters, { pattern: "*.txt", limit: 1 })).toBe(true);
    expect(Value.Check(tool.parameters, { pattern: "*.txt", limit: "1" })).toBe(true);
    expect(Value.Check(tool.parameters, { pattern: "*.txt", type: "bogus" })).toBe(false);

    const dir = mkdtempSync(join(tmpdir(), "repro-233-find-limit-"));
    try {
      writeFileSync(join(dir, "a.txt"), "a");
      writeFileSync(join(dir, "b.txt"), "b");
      _testable.isFdAvailable = () => false;

      const one = await execute(
        tool,
        { pattern: "*.txt", limit: "1", sortBy: "name", reverse: true },
        dir,
      );
      expect(one.isError).toBeUndefined();
      expect(one.details.ptcValue).toEqual({
        tool: "find",
        pattern: "*.txt",
        totalEntries: 2,
        truncated: true,
        entries: [{ path: "b.txt", type: "file" }],
      });

      const exact = await execute(tool, { pattern: "*.txt", limit: 2 }, dir);
      expect(exact.details.ptcValue).toEqual({
        tool: "find",
        pattern: "*.txt",
        totalEntries: 2,
        truncated: false,
        entries: [
          { path: "a.txt", type: "file" },
          { path: "b.txt", type: "file" },
        ],
      });

      const omitted = await execute(tool, { pattern: "*.txt" }, dir);
      expect(omitted.details.ptcValue).toEqual({
        tool: "find",
        pattern: "*.txt",
        totalEntries: 2,
        truncated: false,
        entries: [
          { path: "a.txt", type: "file" },
          { path: "b.txt", type: "file" },
        ],
      });

      const missingPath = join(dir, "missing");
      const invalidCases = [
        { value: 0, message: "Invalid limit: expected a positive integer, received 0." },
        { value: -1, message: "Invalid limit: expected a positive integer, received -1." },
        { value: 1.5, message: "Invalid limit: expected a base-10 integer, received 1.5." },
        { value: "0", message: "Invalid limit: expected a positive integer, received 0." },
        { value: "-1", message: "Invalid limit: expected a positive integer, received -1." },
        { value: "1.5", message: "Invalid limit: expected a base-10 integer, received \"1.5\"." },
        { value: "not-a-number", message: "Invalid limit: expected a base-10 integer, received \"not-a-number\"." },
      ];

      for (const { value, message } of invalidCases) {
        const result = await execute(
          tool,
          { pattern: "*.txt", path: missingPath, limit: value },
          dir,
        );
        expect(result).toMatchObject({
          isError: true,
          content: [{ type: "text", text: message }],
          details: {
            ptcValue: {
              tool: "find",
              ok: false,
              path: missingPath,
              error: { code: "invalid-limit", message },
            },
          },
        });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("classifies ls scan-time filesystem errors", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repro-233-ls-scan-"));
    try {
      const cases = [
        {
          fsCode: "EACCES",
          ptcCode: "permission-denied",
          text: `Error: permission denied for path '${dir}'`,
        },
        {
          fsCode: "EPERM",
          ptcCode: "permission-denied",
          text: `Error: permission denied for path '${dir}'`,
        },
        {
          fsCode: "ENOENT",
          ptcCode: "path-not-found",
          text: `Error: path '${dir}' does not exist`,
        },
        {
          fsCode: "EIO",
          ptcCode: "fs-error",
          text: `Error: could not access path '${dir}': mock EIO`,
        },
      ];

      for (const { fsCode, ptcCode, text } of cases) {
        const error = Object.assign(new Error(`mock ${fsCode}`), { code: fsCode });
        vi.mocked(readdir).mockRejectedValueOnce(error);

        const result = await execute(getLsTool(), { path: dir }, process.cwd());
        expect(result).toMatchObject({
          isError: true,
          content: [{ type: "text", text }],
          details: {
            ptcValue: {
              tool: "ls",
              ok: false,
              path: dir,
              error: { code: ptcCode, message: text },
            },
          },
        });
        if (fsCode === "EIO") {
          expect(result.details.ptcValue.error.details).toEqual({
            fsCode: "EIO",
            fsMessage: "mock EIO",
          });
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    if (
      process.platform !== "win32" &&
      typeof process.getuid === "function" &&
      process.getuid() !== 0
    ) {
      const restricted = mkdtempSync(join(tmpdir(), "repro-233-ls-eacces-"));
      chmodSync(restricted, 0o000);
      try {
        const result = await execute(getLsTool(), { path: restricted }, process.cwd());
        expect(result).toMatchObject({
          isError: true,
          content: [{
            type: "text",
            text: `Error: permission denied for path '${restricted}'`,
          }],
          details: {
            ptcValue: {
              tool: "ls",
              ok: false,
              path: restricted,
              error: { code: "permission-denied" },
            },
          },
        });
      } finally {
        chmodSync(restricted, 0o700);
        rmSync(restricted, { recursive: true, force: true });
      }
    }
  });

  it("ls glob matching includes dotfiles and dot-directories", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repro-233-ls-dot-"));
    try {
      writeFileSync(join(dir, ".env"), "SECRET=test\n");
      writeFileSync(join(dir, "visible.txt"), "visible\n");
      const tool = getLsTool();

      const original = await execute(tool, { path: dir, glob: "*" }, process.cwd());
      expect(original.details.ptcValue.entries).toEqual([
        { name: ".env", type: "file" },
        { name: "visible.txt", type: "file" },
      ]);
      expect(original.content[0].text).toBe(".env\nvisible.txt");

      mkdirSync(join(dir, ".config"));
      mkdirSync(join(dir, "visible-dir"));
      writeFileSync(join(dir, ".notes.md"), "notes\n");

      const limited = await execute(
        tool,
        { path: dir, glob: "*", limit: 2 },
        process.cwd(),
      );
      expect(limited.details.ptcValue).toMatchObject({
        tool: "ls",
        path: dir,
        totalEntries: 5,
        truncated: true,
        entries: [
          { name: ".config", type: "dir" },
          { name: "visible-dir", type: "dir" },
        ],
      });
      expect(limited.content[0].text).toBe(
        ".config/\nvisible-dir/\n[… 3 more entries — use glob to narrow results]",
      );

      const explicit = await execute(tool, { path: dir, glob: ".*" }, process.cwd());
      expect(explicit.details.ptcValue).toMatchObject({
        totalEntries: 3,
        truncated: false,
        entries: [
          { name: ".config", type: "dir" },
          { name: ".env", type: "file" },
          { name: ".notes.md", type: "file" },
        ],
      });
      expect(explicit.content[0].text).toBe(".config/\n.env\n.notes.md");

      const txtOnly = await execute(tool, { path: dir, glob: "*.txt" }, process.cwd());
      expect(txtOnly.details.ptcValue.entries).toEqual([
        { name: "visible.txt", type: "file" },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
