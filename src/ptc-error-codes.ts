/**
 * PTC error code taxonomy — single source of truth.
 *
 * Every error returned via `ptcValue.error.code` MUST be a key in this map.
 * To add a new error: extend this object with a kebab-case code, a one-line
 * description, and the trigger condition. Codes are stable: renaming is a
 * breaking change for downstream consumers.
 *
 * Distinction:
 * - errors (this file): fatal — the tool could not produce its primary result.
 * - warnings (PtcWarning): non-fatal — the tool produced a result but flagged
 *   something the agent should know.
 */
export const PTC_ERROR_CODES = {
  // read
  "file-not-found": { description: "Target file does not exist", trigger: "fs ENOENT on read" },
  "path-is-directory": { description: "Path resolves to a directory, not a file", trigger: "fs EISDIR on read" },
  "permission-denied": { description: "Filesystem refused access", trigger: "fs EACCES or EPERM" },
  "fs-error": { description: "Unexpected filesystem failure outside the specific classified cases", trigger: "non-ENOENT/non-EISDIR/non-EACCES/non-EPERM fs error while reading, writing, or stat'ing a path" },
  "offset-past-end": { description: "Requested offset exceeds file length", trigger: "offset > total lines" },
  "invalid-params-combo": { description: "Mutually exclusive parameters combined", trigger: "e.g. symbol + offset, bundle + map, map + symbol" },
  "invalid-offset": { description: "offset is not a positive integer", trigger: "non-int or value < 1" },
  "invalid-limit": { description: "limit is not a positive integer", trigger: "non-int or value < 1" },

  // edit
  "file-not-read": { description: "edit called on a path that was not read in this session", trigger: "wasReadInSession returned false" },
  "hash-mismatch": { description: "edit anchors do not verify against current file contents", trigger: "applyHashlineEdits detected stale anchors" },
  "no-op": { description: "edits produced identical content", trigger: "originalNormalized === result after applying edits" },
  "text-not-found": { description: "replace.old_text not present in file", trigger: "replaceText returned 0 matches" },
  "binary-file": { description: "edit refused because file is binary", trigger: "looksLikeBinary detected NUL bytes or invalid UTF-8" },
  "invalid-edit-variant": { description: "edits[i] is not exactly one of set_line/replace_lines/insert_after/replace", trigger: "exactly-one variant check failed" },

  // grep
  "binary-file-target": { description: "grep target is a binary file", trigger: "explicit binary path supplied" },
  "passthrough-unparsed": { description: "builtin grep result format unrecognized", trigger: "passthrough warning from underlying tool" },

  // ast_search
  "sg-not-installed": { description: "ast-grep CLI is not installed", trigger: "ENOENT on `sg` invocation" },
  "sg-execution-error": { description: "ast-grep process exited with an error", trigger: "non-zero exit or stderr output" },

  // find / ls (shared shape)
  "path-not-found": { description: "search/target path does not exist", trigger: "stat failed on path" },
  "path-not-directory": { description: "path is a file, not a directory", trigger: "stat returned non-directory" },

  // write
  "binary-content": { description: "content written to write tool looks binary", trigger: "looksLikeBinary on supplied content" },

  // nu
  "nu-non-zero-exit": { description: "nushell command exited with non-zero status", trigger: "result.exitCode !== 0 (and not timed out)" },
  "nu-timed-out": { description: "nushell command exceeded the timeout", trigger: "result.timedOut === true" },
  "nu-spawn-error": { description: "failed to spawn the nushell process", trigger: "spawn ENOENT or other spawn-time error" },
  "nu-temp-file-error": { description: "failed to write the temporary nushell script file", trigger: "fs writeFileSync failed in executeNuScript" },
  "syntax-regression": {
    description: "edit introduced new tree-sitter syntax errors compared to pre-edit content",
    trigger: "post-write validator detected net-new ERROR or MISSING nodes (block mode)",
  },
} as const;

export type PtcErrorCode = keyof typeof PTC_ERROR_CODES;
