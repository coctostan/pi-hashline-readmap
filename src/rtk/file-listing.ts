import { dirname } from "path";

export function isFileListingCommand(cmd: string): boolean {
  const c = cmd.trim().toLowerCase();
  if (c.startsWith("find ") || c === "find") return true;
  if (c.startsWith("tree") && (c === "tree" || c.charAt(4) === " ")) return true;
  // ls with recursive or long flags
  if (c.startsWith("ls ")) {
    const rest = c.slice(3);
    if (rest.includes("-") && (rest.includes("r") || rest.includes("l"))) return true;
  }
  return false;
}

export function compressFileListingOutput(output: string): string | null {
  const rawLines = output.split("\n");
  if (rawLines.length <= 100) return output;
  const lines = rawLines.filter((l) => l.trim() !== "");

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
    result.push(`${dir}/ (${count} files)`);
  }

  result.push("");
  result.push(`Total: ${totalFiles} files in ${dirCounts.size} directories`);

  return result.join("\n");
}
