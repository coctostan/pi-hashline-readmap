import { lstat, mkdir, open, readlink, rename, stat, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join, parse, resolve, sep } from "node:path";

export async function resolveMutationTargetPath(path: string): Promise<string> {
  const absolutePath = resolve(path);
  const { root } = parse(absolutePath);
  const parts = absolutePath
    .slice(root.length)
    .split(sep)
    .filter((part) => part.length > 0);
  const visitedSymlinks = new Set<string>();

  async function resolveFromParts(currentPath: string, remainingParts: string[]): Promise<string> {
    if (remainingParts.length === 0) {
      return currentPath;
    }

    const [nextPart, ...tail] = remainingParts;
    const candidatePath = join(currentPath, nextPart);

    try {
      const candidateStats = await lstat(candidatePath);
      if (!candidateStats.isSymbolicLink()) {
        return resolveFromParts(candidatePath, tail);
      }

      if (visitedSymlinks.has(candidatePath)) {
        const error = new Error(`Too many symbolic links while resolving ${path}`) as NodeJS.ErrnoException;
        error.code = "ELOOP";
        throw error;
      }
      visitedSymlinks.add(candidatePath);

      const linkTargetPath = resolve(dirname(candidatePath), await readlink(candidatePath));
      const targetParts = linkTargetPath
        .slice(parse(linkTargetPath).root.length)
        .split(sep)
        .filter((part) => part.length > 0);
      return resolveFromParts(parse(linkTargetPath).root, [...targetParts, ...tail]);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        return join(candidatePath, ...tail);
      }
      throw error;
    }
  }

  return resolveFromParts(root, parts);
}

export async function writeFileAtomically(path: string, content: string): Promise<void> {
  const targetPath = await resolveMutationTargetPath(path);

  let existingStats: Awaited<ReturnType<typeof stat>> | null = null;
  try {
    existingStats = await stat(targetPath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw error;
    }
  }

  // Hard links: update the inode in place so every link sees the new content.
  if (existingStats && existingStats.nlink > 1) {
    await writeFile(targetPath, content, "utf-8");
    return;
  }

  const dir = dirname(targetPath);
  await mkdir(dir, { recursive: true });
  const tempPath = join(dir, `.tmp-${randomUUID()}`);
  const tempHandle = await open(tempPath, "wx", 0o600);
  try {
    try {
      await tempHandle.writeFile(content, "utf-8");
      if (existingStats) {
        // Overwrite: keep the target's prior permission bits (AC 7).
        await tempHandle.chmod(existingStats.mode & 0o7777);
      } else {
        // New file: land at the OS/umask default (AC 8), not the temp's 0o600.
        const umask = process.umask();
        process.umask(umask); // restore immediately; we only wanted to read it
        await tempHandle.chmod(0o666 & ~umask);
      }
    } finally {
      await tempHandle.close();
    }
    await rename(tempPath, targetPath);
  } catch (error: unknown) {
    // Best-effort cleanup so write/chmod/rename failures leave no orphan temp (AC 12).
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}
