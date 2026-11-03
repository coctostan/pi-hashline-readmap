import { stripAnsi } from "./ansi.ts";
import * as git from "./git.ts";
import * as linter from "./linter.ts";
import * as build from "./build.ts";
import * as packageManager from "./package-manager.ts";
import * as docker from "./docker.ts";
import * as fileListing from "./file-listing.ts";
import * as httpClient from "./http-client.ts";
import * as buildTools from "./build-tools.ts";
import * as transfer from "./transfer.ts";
import { getBashAntiPatternHint } from "./bash-anti-pattern-hints.ts";
import { commandWords, parseShellCommands } from "../bash-command-state.ts";
import type { Drop } from "./drops.ts";

export interface CompressionInfo {
  originalBytes: number;
  outputBytes: number;
  compressionRatio: number;
  technique:
    | "test-output"
    | "git"
    | "linter"
    | "build-tools"
    | "build"
    | "package-manager"
    | "docker"
    | "file-listing"
    | "http-client"
    | "transfer"
    | "none";
  bypassedBy?: "env-var" | "unsaved-original";
}
export interface FilterResult {
  output: string;
  savedChars: number;
  /** A compactor changed the output, beyond ANSI stripping and the anti-pattern hint. */
  compacted: boolean;
  /** What that compactor left out, one entry per marker in `output`; empty when none compacted. */
  dropped: Drop[];
  info: CompressionInfo;
}

export interface FilterBashOutputOptions {
  isError?: boolean;
  /** Skip route compression as `PI_RTK_BYPASS=1` does: no saved original, no cut. */
  bypass?: "unsaved-original";
}

export function isTestCommand(command: string): boolean {
  const c = command.toLowerCase();
  return ["vitest", "jest", "pytest", "cargo test", "npm test", "npx vitest", "bun test", "go test", "mocha"].some(
    (t) => c.includes(t),
  );
}

export function isGitCommand(command: string): boolean {
  const c = command.toLowerCase().trimStart();
  return c === "git" || c.startsWith("git ");
}

export function isBuildCommand(command: string): boolean {
  return build.isBuildCommand(command);
}

export function isLinterCommand(command: string): boolean {
  const c = command.toLowerCase();
  return ["eslint", "prettier --check", "tsc --noemit"].some((t) => c.includes(t));
}

// Commands that print nothing on success, unless given `-` (`cd -`) or a verbose flag (`mkdir -p -v`, `set -v`).
const SILENT_COMMANDS = new Set(["cd", "pushd", "popd", "export", "unset", "set", "true", ":"]);

/**
 * The one part of a command line whose output fills the result: top-level, not feeding a pipe, not known to
 * print nothing. Undefined when none or several print, since their merged output fits no one compactor.
 * shortcut: `>(…)` parts count as silent though they print, as do `pushd`/`popd`, bare `set`/`export`,
 * `set -x` and a `cd` that `CDPATH` resolves; upgrade when one turns up in use.
 */
function printingPart(command: string): string | undefined {
  const printing = parseShellCommands(command, undefined).commands.filter((part) => {
    if (part.inSubstitution || part.feedsPipe) return false;
    const [name, ...args] = commandWords(part.words);
    if (name === undefined) return false;
    const silent = SILENT_COMMANDS.has(name) || (name === "mkdir" && args.includes("-p"));
    return !silent || args.some((arg) => arg === "-" || arg === "--verbose" || /^-[a-zA-Z]*v/.test(arg));
  });
  return printing.length === 1 ? printing[0].text : undefined;
}

function makeInfo(
  original: string,
  final: string,
  technique: CompressionInfo["technique"],
  extra: Partial<Pick<CompressionInfo, "bypassedBy">> = {},
): CompressionInfo {
  const originalBytes = Buffer.byteLength(original, "utf8");
  const outputBytes = Buffer.byteLength(final, "utf8");
  const compressionRatio = originalBytes === 0 ? 1 : outputBytes / originalBytes;
  return { originalBytes, outputBytes, compressionRatio, technique, ...extra };
}

export function filterBashOutput(
  command: string,
  output: string,
  options: FilterBashOutputOptions = {},
): FilterResult {
  if (output === "") {
    return { output: "", savedChars: 0, compacted: false, dropped: [], info: makeInfo("", "", "none") };
  }

  const stripped = stripAnsi(output);
  const bypassedBy = /\bPI_RTK_BYPASS=1\b/.test(command) ? "env-var" : options.bypass;
  if (bypassedBy) {
    let result = stripped;
    const antiPatternHint = getBashAntiPatternHint(command);
    if (antiPatternHint) {
      result = result ? `${result}\n\n${antiPatternHint}` : antiPatternHint;
    }
    return {
      output: result,
      savedChars: output.length - result.length,
      compacted: false,
      dropped: [],
      info: makeInfo(output, result, "none", { bypassedBy }),
    };
  }
  const part = printingPart(command);
  if (part !== undefined && isTestCommand(part)) {
    return {
      output: stripped,
      savedChars: output.length - stripped.length,
      compacted: false,
      dropped: [],
      info: makeInfo(output, stripped, "test-output"),
    };
  }
  let result = stripped;
  let technique: CompressionInfo["technique"] = "none";
  let dropped: Drop[] = [];
  if (part !== undefined && options.isError !== true) {
    try {
      type Route = { matches: boolean; technique: CompressionInfo["technique"]; apply: (drops: Drop[]) => string | null };
      const routes: Route[] = [
        { matches: isGitCommand(part), technique: "git", apply: (drops) => git.compactGitOutput(stripped, part, drops) },
        {
          matches: isLinterCommand(part),
          technique: "linter",
          apply: (drops) => linter.aggregateLinterOutput(stripped, part, drops),
        },
        {
          matches: buildTools.isBuildToolsCommand(part),
          technique: "build-tools",
          apply: () => buildTools.compressBuildToolsOutput(stripped),
        },
        { matches: isBuildCommand(part), technique: "build", apply: (drops) => build.filterBuildOutput(stripped, part, drops) },
        {
          matches: packageManager.isPackageManagerCommand(part),
          technique: "package-manager",
          apply: () => packageManager.compressPackageManagerOutput(stripped),
        },
        { matches: docker.isDockerCommand(part), technique: "docker", apply: () => docker.compressDockerOutput(stripped) },
        {
          matches: fileListing.isFileListingCommand(part),
          technique: "file-listing",
          apply: (drops) => fileListing.compressFileListingOutput(stripped, drops),
        },
        {
          matches: httpClient.isHttpCommand(part),
          technique: "http-client",
          apply: (drops) => httpClient.compressHttpOutput(stripped, drops),
        },
        { matches: transfer.isTransferCommand(part), technique: "transfer", apply: (drops) => transfer.compressTransferOutput(stripped, drops) },
      ];
      // A `find` part goes to the file-listing route alone: an `-exec eslint` is no linter run to summarize.
      const findOnly = fileListing.isFindCommand(part);
      for (const route of routes) {
        if (!route.matches || (findOnly && route.technique !== "file-listing")) continue;
        technique = route.technique;
        const drops: Drop[] = [];
        const next = route.apply(drops);
        const erasedNonEmptyOutput =
          next !== null && stripped.length > 0 && next.trim() === "";
        if (next !== null && !erasedNonEmptyOutput) {
          result = next;
          dropped = drops;
          break;
        }
        technique = "none";
      }
    } catch {
      result = stripped;
      technique = "none";
      dropped = [];
    }
  }
  const compacted = result !== stripped;
  const antiPatternHint = getBashAntiPatternHint(command);
  if (antiPatternHint) {
    result = result ? `${result}\n\n${antiPatternHint}` : antiPatternHint;
  }
  return {
    output: result,
    savedChars: output.length - result.length,
    compacted,
    dropped,
    info: makeInfo(output, result, technique),
  };
}
