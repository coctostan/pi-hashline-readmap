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

const STRIP_LINE_PATTERNS = [
  /[⸩⠋⠹]/,
  /^npm\s+http\b/i,
  /^npm\s+timing\b/i,
  /^Resolution\s+step\s+details:/i,
];

const KEEP_LINE_PATTERNS = [
  /\badded\b/i,
  /\bremoved\b/i,
  /\bup to date\b/i,
  /\baudited\b/i,
  /WARN/,
  /ERR!/,
  /\berror\b/i,
  /\bin\s+\d+(?:\.\d+)?(?:ms|s|m)\b/i,
  /^Done in\s+\d+(?:\.\d+)?s\.?$/i,
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

  const kept = lines.filter((line) => {
    if (STRIP_LINE_PATTERNS.some((pattern) => pattern.test(line))) {
      return false;
    }

    return KEEP_LINE_PATTERNS.some((pattern) => pattern.test(line));
  });

  if (kept.length === 0) {
    return null;
  }

  return kept.join("\n");
}
