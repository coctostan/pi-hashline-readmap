import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  chmod, link, lstat, readFile, readdir, readlink,
  stat, symlink, writeFile,
} from "node:fs/promises";
import { mkdtempSync as mkdtempSyncRoot, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomically } from "../src/fs-write.js";

let dir: string;

beforeEach(() => {
  // realpathSync canonicalizes the temp dir so the symlink/dangling/hard-link
  // path-equality assertions below match the helper's resolved output. On macOS
  // tmpdir() is /var/folders/... and /var is a symlink to /private/var, which
  // resolveMutationTargetPath would otherwise canonicalize.
  dir = realpathSync(mkdtempSyncRoot(join(tmpdir(), "fs-write-atomic-")));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("writeFileAtomically", () => {
  it("creates a new file with the given content", async () => {
    const p = join(dir, "created.txt");
    await writeFileAtomically(p, "hello\n");
    expect(await readFile(p, "utf-8")).toBe("hello\n");
  });

  it("creates parent directories that do not yet exist", async () => {
    const p = join(dir, "nested", "deep", "file.txt");
    await writeFileAtomically(p, "deep\n");
    expect(await readFile(p, "utf-8")).toBe("deep\n");
  });

  it("overwrites an existing file and leaves no temp files behind", async () => {
    const p = join(dir, "over.txt");
    await writeFile(p, "before\n", "utf-8");
    await writeFileAtomically(p, "after\n");
    expect(await readFile(p, "utf-8")).toBe("after\n");
    const entries = await readdir(dir);
    expect(entries.filter((e) => e.startsWith(".tmp-"))).toEqual([]);
  });

  it("preserves the target mode when overwriting (0o755 stays 0o755)", async () => {
    const p = join(dir, "script.sh");
    await writeFile(p, "echo before\n", "utf-8");
    await chmod(p, 0o755);
    await writeFileAtomically(p, "echo after\n");
    expect((await stat(p)).mode & 0o777).toBe(0o755);
  });

  it("preserves the target mode under a restrictive umask", async () => {
    const p = join(dir, "public.txt");
    await writeFile(p, "before\n", "utf-8");
    await chmod(p, 0o644);
    const prev = process.umask(0o077);
    try {
      await writeFileAtomically(p, "after\n");
    } finally {
      process.umask(prev);
    }
    expect((await stat(p)).mode & 0o777).toBe(0o644);
  });

  it("creates a new file at the umask default mode, not 0o600 (AC 8)", async () => {
    const p = join(dir, "fresh.txt");
    const prev = process.umask(0o022);
    try {
      await writeFileAtomically(p, "new\n");
    } finally {
      process.umask(prev);
    }
    expect((await stat(p)).mode & 0o777).toBe(0o644);
  });

  it("updates a symlink's target without replacing the symlink", async () => {
    const target = join(dir, "target.txt");
    const linkPath = join(dir, "linked.txt");
    await writeFile(target, "before\n", "utf-8");
    await symlink("target.txt", linkPath);
    await writeFileAtomically(linkPath, "after\n");
    expect(await readFile(target, "utf-8")).toBe("after\n");
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect(await readlink(linkPath)).toBe("target.txt");
  });

  it("writes through a dangling symlink chain to the terminal target", async () => {
    const intermediate = join(dir, "level-2.txt");
    const top = join(dir, "level-1.txt");
    const missing = join(dir, "missing.txt");
    await symlink("missing.txt", intermediate);
    await symlink("level-2.txt", top);
    await writeFileAtomically(top, "after\n");
    expect((await lstat(top)).isSymbolicLink()).toBe(true);
    expect((await lstat(intermediate)).isSymbolicLink()).toBe(true);
    expect(await readFile(missing, "utf-8")).toBe("after\n");
  });

  it("preserves hard links by updating the inode in place", async () => {
    const primary = join(dir, "primary.txt");
    const sibling = join(dir, "sibling.txt");
    await writeFile(primary, "before\n", "utf-8");
    await link(primary, sibling);
    const inode = (await stat(primary)).ino;
    await writeFileAtomically(primary, "after\n");
    expect(await readFile(primary, "utf-8")).toBe("after\n");
    expect(await readFile(sibling, "utf-8")).toBe("after\n");
    expect((await stat(primary)).ino).toBe(inode);
    expect((await stat(sibling)).ino).toBe(inode);
  });
});
