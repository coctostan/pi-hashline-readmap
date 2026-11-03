const INSTALL_COMMAND_PATTERNS = [
  /^npm\s+install(?:\s|$)/,
  /^npm\s+i(?:\s|$)/,
  /^npm\s+ci(?:\s|$)/,
  /^yarn\s*$/,
  /^yarn\s+install(?:\s|$)/,
  /^yarn\s+add(?:\s|$)/,
  /^pnpm\s+install(?:\s|$)/,
  /^pnpm\s+i(?:\s|$)/,
  /^pnpm\s+add(?:\s|$)/,
];

// Spinners, npm's fetch and timing logs, yarn's resolution details and blank lines; every other line is kept.
const STRIP_LINE_PATTERNS = [
  /^\s*[⸩⠋⠹]\s/, // a spinner frame leading the line
  /^npm\s+http\b/i,
  /^npm\s+timing\b/i,
  /^Resolution\s+step\s+details:/i,
  /^\s*$/,
];

export function isPackageManagerCommand(cmd: string): boolean {
  const normalized = cmd.toLowerCase().trim();
  return INSTALL_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function compressPackageManagerOutput(output: string): string | null {
  const lines = output.split("\n");

  if (lines.length < 10) {
    return output;
  }

  const kept = lines.filter((line) => !STRIP_LINE_PATTERNS.some((pattern) => pattern.test(line)));

  if (kept.length === 0) {
    return null;
  }

  return kept.join("\n");
}
