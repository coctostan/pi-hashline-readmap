function hasCommand(command: string, name: string): boolean {
  return new RegExp(`(^|[\\s|&;()])${name}(?=$|[\\s|&;()])`, "i").test(command);
}

export function getBashAntiPatternHint(command: string): string | null {
  if (hasCommand(command, "cat")) {
    return "[Hint: Prefer the read tool for file contents.]";
  }

  if (hasCommand(command, "grep") || hasCommand(command, "rg")) {
    return "[Hint: Prefer the grep tool for content search.]";
  }

  if (hasCommand(command, "sed") && !/\s-i(\s|$)/i.test(command) && /-n|p['"]?$/i.test(command)) {
    return "[Hint: Prefer the read tool for file inspection and the edit tool for changes.]";
  }

  if (/^\s*find\s+/i.test(command) && !/\s-exec\s/i.test(command)) {
    return "[Hint: Prefer the dedicated file-search tools for repository discovery.]";
  }

  return null;
}
