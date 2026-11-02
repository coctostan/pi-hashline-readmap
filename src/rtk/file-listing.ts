import { dirname } from "path";

const LONG_FORMAT_LS_ROW_RE = /^[bcdlps-][rwxStTs-]{9}[+@.]?\s+/;
const LONG_FORMAT_LS_TOTAL_RE = /^total\s+\d+\s*$/;

function isLongFormatLsLine(line: string): boolean {
  return (
    LONG_FORMAT_LS_ROW_RE.test(line.trimStart()) ||
    LONG_FORMAT_LS_TOTAL_RE.test(line.trim())
  );
}

// Only `find` prints one path per line; an `ls -R` or `tree` summary would count headers and tree lines as entries.
export function isFileListingCommand(cmd: string): boolean {
  const c = cmd.trim().toLowerCase();
  return c === "find" || c.startsWith("find ");
}

export function compressFileListingOutput(output: string): string | null {
  const rawLines = output.split("\n");
  if (rawLines.some(isLongFormatLsLine)) return null;
  const lines = rawLines.filter((line) => line.trim() !== "");
  if (lines.length <= 100) return output;

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
  result.push(`Total: ${totalFiles} entries in ${dirCounts.size} directories`);

  return result.join("\n");
}
