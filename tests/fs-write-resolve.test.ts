import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveMutationTargetPath } from "../src/fs-write.js";

let dir: string;

beforeEach(() => {
  // realpathSync canonicalizes the temp dir so expected paths match the
  // helper's symlink-resolved output. On macOS tmpdir() is /var/folders/...
  // and /var is itself a symlink to /private/var, so resolveMutationTargetPath
  // would otherwise return /private/var/... and every path-equality check below
  // would FAIL.
  dir = realpathSync(mkdtempSync(join(tmpdir(), "fs-write-resolve-")));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("resolveMutationTargetPath", () => {
  it("returns a plain (non-symlink) path unchanged", async () => {
    const p = join(dir, "plain.txt");
    expect(await resolveMutationTargetPath(p)).toBe(p);
  });

  it("resolves a symlink through to its real terminal target", async () => {
    const target = join(dir, "target.txt");
    const link = join(dir, "linked.txt");
    // relative link so it is resolved against the link's own directory
    symlinkSync("target.txt", link);
    expect(await resolveMutationTargetPath(link)).toBe(target);
  });

  it("returns the missing terminal target for a dangling symlink chain", async () => {
    const intermediate = join(dir, "level-2.txt");
    const top = join(dir, "level-1.txt");
    const missing = join(dir, "missing.txt");
    symlinkSync("missing.txt", intermediate);
    symlinkSync("level-2.txt", top);
    expect(await resolveMutationTargetPath(top)).toBe(missing);
  });

  it("throws ELOOP on a symlink cycle", async () => {
    const a = join(dir, "a.txt");
    const b = join(dir, "b.txt");
    symlinkSync("b.txt", a);
    symlinkSync("a.txt", b);
    await expect(resolveMutationTargetPath(a)).rejects.toMatchObject({ code: "ELOOP" });
  });
});
