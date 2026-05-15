/**
 * Shared subprocess and native helper utilities for readmap mappers.
 *
 * These replace shell-string `child_process.exec()` invocations that
 * interpolated user-controlled file paths. See:
 *   docs/security/SEC-001-mapper-subprocess-ledger.md
 *
 * Two guarantees this module exists to enforce:
 *
 *  1. No shell is ever invoked from a mapper. Subprocesses go through
 *     `child_process.execFile`, which accepts an explicit argv array and
 *     never interprets shell metacharacters in arguments.
 *
 *  2. Trivial shell utilities (`wc -l`, `grep | head`) are replaced by
 *     pure Node.js helpers with pinned, documented semantics. This both
 *     removes shell exposure and reduces the external-binary dependency
 *     surface.
 */

import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ExecFileOptions {
  signal?: AbortSignal;
  timeout?: number;
  maxBuffer?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ExecFileResult {
  stdout: string;
  stderr: string;
}

/**
 * Safe argv-only subprocess wrapper.
 *
 * Never invokes a shell. The `args` array is passed verbatim to the OS
 * `execve()` call, so shell metacharacters in any argument (including
 * file paths) cannot influence command parsing.
 *
 * Preserves the timeout / maxBuffer / signal behavior of the previous
 * `promisify(exec)` calls so mapper-level error handling is unchanged.
 */
export async function execFileSafe(
  command: string,
  args: readonly string[],
  options: ExecFileOptions = {}
): Promise<ExecFileResult> {
  const { stdout, stderr } = await execFileAsync(command, args as string[], {
    signal: options.signal,
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
  });
  return {
    stdout: stdout ?? "",
    stderr: stderr ?? "",
  };
}

/**
 * Count newline (`0x0A`) bytes in a file.
 *
 * Replaces `wc -l < "${filePath}"`. The semantics match POSIX `wc -l`
 * exactly: a file ending without a trailing newline reports the same
 * count as one ending with newline minus one.
 *
 * Streams the file in 64 KB chunks; does not load the whole file into
 * memory and does not decode text. Honors `AbortSignal`.
 */
export async function countLinesNative(
  filePath: string,
  signal?: AbortSignal
): Promise<number> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  // Stream byte counting — avoids loading large files.
  return await new Promise<number>((resolve, reject) => {
    let count = 0;
    const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 });

    const onAbort = () => {
      stream.destroy(new DOMException("Aborted", "AbortError"));
    };

    if (signal) {
      if (signal.aborted) {
        stream.destroy(new DOMException("Aborted", "AbortError"));
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    stream.on("data", (chunk: string | Buffer) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      // Buffer#includes/indexOf is fast; loop tallies all newlines.
      for (let i = 0; i < buf.length; i++) {
        if (buf[i] === 0x0a) {
          count++;
        }
      }
    });
    stream.on("error", (err) => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      reject(err);
    });
    stream.on("end", () => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      resolve(count);
    });
  });
}

export interface ScanMatch {
  lineNumber: number;
  content: string;
}

export interface ScanOptions {
  /** Maximum matches to return (default 500). */
  limit?: number;
  /** Maximum bytes to read before stopping (default 10 MiB). */
  maxBytes?: number;
}

/**
 * Scan a file for lines matching any of the supplied regular expressions.
 *
 * Replaces `grep -n "${combinedPattern}" "${filePath}" | head -500` used
 * by the fallback mapper.
 *
 * Semantics:
 *  - Reads the file as UTF-8 text in 64 KB chunks.
 *  - Iterates lines in file order; line numbers are 1-based.
 *  - A line matches if ANY regex in `patterns` matches (logical OR), matching
 *    grep's `\|` BRE alternation as used by the legacy code.
 *  - Returns up to `options.limit` matches (default 500) — matches `head -500`.
 *  - Each returned `content` is the matched line with leading/trailing
 *    whitespace trimmed (the legacy code called `.trim()` on the grep
 *    result line after stripping `LINENO:`).
 *  - Returns `[]` on read error (the legacy code swallowed grep exit
 *    code 1, which also produced no matches).
 *  - Honors `AbortSignal`.
 *
 * Important: regex patterns supplied here come from STATIC constants in
 * the mapper module. They never include untrusted file content.
 */
export async function scanForMatches(
  filePath: string,
  patterns: readonly RegExp[],
  options: ScanOptions = {},
  signal?: AbortSignal
): Promise<ScanMatch[]> {
  const limit = options.limit ?? 500;
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  const matches: ScanMatch[] = [];

  let fileHandle;
  try {
    fileHandle = await open(filePath, "r");
  } catch {
    return [];
  }

  try {
    let lineNumber = 0;
    let leftover = "";
    let bytesRead = 0;
    const buffer = Buffer.allocUnsafe(64 * 1024);

    while (true) {
      if (signal?.aborted) {
        return matches;
      }
      const { bytesRead: n } = await fileHandle.read(
        buffer,
        0,
        buffer.length,
        null
      );
      if (n === 0) {
        break;
      }
      bytesRead += n;
      const text = leftover + buffer.subarray(0, n).toString("utf8");
      const lines = text.split("\n");
      // Last fragment may be a partial line — defer until next read.
      leftover = lines.pop() ?? "";

      for (const line of lines) {
        lineNumber++;
        if (matchesAny(line, patterns)) {
          matches.push({ lineNumber, content: line.trim() });
          if (matches.length >= limit) {
            return matches;
          }
        }
      }

      if (bytesRead >= maxBytes) {
        break;
      }
    }

    // Handle final line with no trailing newline.
    if (leftover.length > 0) {
      lineNumber++;
      if (matchesAny(leftover, patterns) && matches.length < limit) {
        matches.push({ lineNumber, content: leftover.trim() });
      }
    }
  } catch {
    // On any read error, return what we have so far (legacy behavior
    // returned [] for grep exit code 1; partial matches are strictly
    // more informative and still safe).
  } finally {
    await fileHandle.close().catch(() => {
      /* ignore */
    });
  }

  return matches;
}

function matchesAny(line: string, patterns: readonly RegExp[]): boolean {
  for (const re of patterns) {
    // Each regex is created per-call by the caller; we do not rely on
    // /g or lastIndex state.
    if (re.test(line)) {
      return true;
    }
  }
  return false;
}
