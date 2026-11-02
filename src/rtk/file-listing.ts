import { dirname } from "path";
import { dropMarker, type Drop } from "./drops.ts";
import { commandWords, parseShellCommands } from "../bash-command-state.ts";

const LONG_FORMAT_LS_ROW_RE = /^[bcdlps-][rwxStTs-]{9}[+@.]?\s+/;
const LONG_FORMAT_LS_TOTAL_RE = /^total\s+\d+\s*$/;

function isLongFormatLsLine(line: string): boolean {
  return (
    LONG_FORMAT_LS_ROW_RE.test(line.trimStart()) ||
    LONG_FORMAT_LS_TOTAL_RE.test(line.trim())
  );
}

// Actions whose output is no one bare path per line (`-ls`, `-printf`, a command's own output, NUL separators, prompts).
const OUTPUT_SHAPING_ACTIONS = new Set(["-printf", "-fprintf", "-ls", "-fls", "-exec", "-execdir", "-ok", "-okdir", "-print0", "-fprint0"]);

/** A `find` command's words, quotes removed; undefined for any other command. */
function findWords(cmd: string): readonly string[] | undefined {
  const words = commandWords(parseShellCommands(cmd, undefined).commands.find((part) => !part.inSubstitution)?.words ?? []);
  return words[0]?.toLowerCase() === "find" ? words : undefined;
}

export function isFindCommand(cmd: string): boolean {
  return findWords(cmd) !== undefined;
}

// Only plain `find` prints one path per line; an `ls -R` or `tree` summary would count headers and tree lines as entries.
export function isFileListingCommand(cmd: string): boolean {
  const words = findWords(cmd);
  return words !== undefined && !words.some((word) => OUTPUT_SHAPING_ACTIONS.has(word));
}

export function compressFileListingOutput(output: string, drops: Drop[] = []): string | null {
  const rawLines = output.split("\n");
  if (rawLines.some(isLongFormatLsLine)) return null;
  const lines = rawLines.filter((line) => line.trim() !== "");
  const errors: string[] = [];
  const dirCounts = new Map<string, number>();
  let totalFiles = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    // Preserve error lines
    if (
      trimmed.includes("Permission denied") ||
      trimmed.includes("No such file") ||
      trimmed.startsWith("find:") ||
      trimmed.startsWith("ls:")
    ) {
      errors.push(trimmed);
      continue;
    }

    // Parse as file path
    const dir = dirname(trimmed) || ".";
    dirCounts.set(dir, (dirCounts.get(dir) || 0) + 1);
    totalFiles++;
  }
  if (totalFiles <= 100) return output;

  const result: string[] = [];

  if (errors.length > 0) {
    result.push(...errors);
    result.push("");
  }

  // Sort directories by count descending
  const sorted = [...dirCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [dir, count] of sorted) {
    result.push(`${dir}/ (${count} entries)`);
  }

  result.push("");
  result.push(dropMarker(drops, totalFiles, "entries", `Total: ${totalFiles} entries in ${dirCounts.size} directories`));

  return result.join("\n");
}
