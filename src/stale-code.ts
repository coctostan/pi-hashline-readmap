import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** When this module graph was evaluated; `index.ts` imports this module first so it precedes the rest. */
export const LOADED_AT = Date.now();

/** What the running code was loaded from, by entry path relative to the package root. */
const WATCHED: Record<string, readonly string[]> = {
  "index.ts": ["index.ts", "src", "prompts"],
  "dist/index.js": ["dist/index.js", "prompts"],
};

/** Session starts that load a new session into a process whose code may predate its files. */
const CHECKED_REASONS = new Set(["new", "resume", "fork"]);

export interface StaleCode {
  count: number;
  /** Newest changed file, relative to the package root with `/` separators. */
  newest: string;
}

function filesUnder(root: string, path: string): string[] {
  const abs = join(root, path);
  const stat = statSync(abs, { throwIfNoEntry: false });
  if (!stat) return [];
  if (!stat.isDirectory()) return [abs];
  return readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

/** The watched files for `entry`'s layout modified after `loadedAt`, or undefined when none were. */
export function staleCodeFiles(root: string, entry: string, loadedAt: number): StaleCode | undefined {
  const watched = WATCHED[relative(root, entry).split(sep).join("/")] ?? [];
  let count = 0;
  let newest: { path: string; mtimeMs: number } | undefined;
  for (const file of watched.flatMap((path) => filesUnder(root, path))) {
    const mtimeMs = statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0;
    if (mtimeMs <= loadedAt) continue;
    count++;
    if (!newest || mtimeMs > newest.mtimeMs) newest = { path: file, mtimeMs };
  }
  return newest ? { count, newest: relative(root, newest.path).split(sep).join("/") } : undefined;
}

/**
 * One check per extension instance: the warning for a `session_start`, or undefined. A session id
 * warns at most once, since Pi may deliver one session start to the same handlers more than once.
 */
export function createStaleCodeCheck(options: { root: string; entry: string; loadedAt: number }) {
  const warned = new Set<string>();
  return (reason: string, sessionId: string): string | undefined => {
    if (!CHECKED_REASONS.has(reason) || warned.has(sessionId)) return undefined;
    const stale = staleCodeFiles(options.root, options.entry, options.loadedAt);
    if (!stale) return undefined;
    warned.add(sessionId);
    const files = stale.count === 1 ? "1 file" : `${stale.count} files`;
    return `Hashline's code changed on disk after pi loaded it (${files}, newest ${stale.newest}); this session still runs the old code. Run /reload to load the new code.`;
  };
}
