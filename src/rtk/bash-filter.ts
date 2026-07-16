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
  bypassedBy?: "env-var";
}
export interface FilterResult {
  output: string;
  savedChars: number;
  info: CompressionInfo;
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
  const c = command.toLowerCase();
  if (/\btsc\b/.test(c)) return true;
  return ["cargo build", "cargo check", "cargo test", "npm run build"].some((t) => c.includes(t));
}

export function isLinterCommand(command: string): boolean {
  const c = command.toLowerCase();
  return ["eslint", "prettier --check", "tsc --noemit"].some((t) => c.includes(t));
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

export function filterBashOutput(command: string, output: string, isError = false): FilterResult {
  if (output === "") {
    return { output: "", savedChars: 0, info: makeInfo("", "", "none") };
  }

  const stripped = stripAnsi(output);
  const bypassed = /\bPI_RTK_BYPASS=1\b/.test(command);
  if (bypassed) {
    let result = stripped;
    const antiPatternHint = getBashAntiPatternHint(command);
    if (antiPatternHint) {
      result = result ? `${result}\n\n${antiPatternHint}` : antiPatternHint;
    }
    return {
      output: result,
      savedChars: output.length - result.length,
      info: makeInfo(output, result, "none", { bypassedBy: "env-var" }),
    };
  }
  if (isTestCommand(command)) {
    return {
      output: stripped,
      savedChars: output.length - stripped.length,
      info: makeInfo(output, stripped, "test-output"),
    };
  }
  let result = stripped;
  let technique: CompressionInfo["technique"] = "none";
  try {
    const routes: Array<{ matches: boolean; technique: CompressionInfo["technique"]; apply: () => string | null }> = [
      { matches: isGitCommand(command), technique: "git", apply: () => git.compactGitOutput(stripped, command) },
      { matches: isLinterCommand(command), technique: "linter", apply: () => linter.aggregateLinterOutput(stripped, command) },
      {
        matches: buildTools.isBuildToolsCommand(command),
        technique: "build-tools",
        apply: () => buildTools.compressBuildToolsOutput(stripped),
      },
      { matches: isBuildCommand(command), technique: "build", apply: () => build.filterBuildOutput(stripped, command) },
      {
        matches: packageManager.isPackageManagerCommand(command),
        technique: "package-manager",
        apply: () => packageManager.compressPackageManagerOutput(stripped),
      },
      { matches: docker.isDockerCommand(command), technique: "docker", apply: () => docker.compressDockerOutput(stripped) },
      {
        matches: fileListing.isFileListingCommand(command),
        technique: "file-listing",
        apply: () => fileListing.compressFileListingOutput(stripped),
      },
      { matches: httpClient.isHttpCommand(command), technique: "http-client", apply: () => httpClient.compressHttpOutput(stripped) },
      { matches: transfer.isTransferCommand(command), technique: "transfer", apply: () => transfer.compressTransferOutput(stripped) },
    ];
    for (const route of routes) {
      if (isError || !route.matches) continue;
      technique = route.technique;
      const next = route.apply();
      if (next !== null) {
        result = next;
        break;
      }
      technique = "none";
    }
  } catch {
    result = stripped;
    technique = "none";
  }
  const antiPatternHint = getBashAntiPatternHint(command);
  if (antiPatternHint) {
    result = result ? `${result}\n\n${antiPatternHint}` : antiPatternHint;
  }
  return {
    output: result,
    savedChars: output.length - result.length,
    info: makeInfo(output, result, technique),
  };
}
