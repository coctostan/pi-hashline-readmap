import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Nearest ancestor directory of `fromUrl` whose package.json declares a `name`. Works from `src/**`
 * and from the bundled `dist/index.js`; `dist/package.json` only types the layout (commonjs) and
 * has no name, so it is skipped.
 */
export function resolvePackageRoot(fromUrl: string): string {
  let dir = dirname(fileURLToPath(fromUrl));
  for (;;) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, "utf8"));
        if (typeof parsed?.name === "string") return dir;
      } catch {
        // Unreadable manifest: keep walking up.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`Could not locate package root from ${fromUrl}`);
    dir = parent;
  }
}

export const PACKAGE_ROOT = resolvePackageRoot(import.meta.url);

export function packagePath(...segments: string[]): string {
  return join(PACKAGE_ROOT, ...segments);
}

export function packageFileUrl(...segments: string[]): URL {
  return pathToFileURL(packagePath(...segments));
}
