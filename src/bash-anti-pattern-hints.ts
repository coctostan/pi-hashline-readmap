function hasCommand(command: string, name: string): boolean {
  return new RegExp(`(^|[\\s|&;()])${name}(?=$|[\\s|&;()])`, "i").test(command);
}

/** Each hint, in priority order, with the tools it names: it fires only while all of them are active. */
const HINTS: ReadonlyArray<{ tools: readonly string[]; matches: (command: string) => boolean; text: string }> = [
  {
    tools: ["read"],
    matches: (command) => hasCommand(command, "cat"),
    text: "[Hint: Prefer the read tool for file contents.]",
  },
  {
    tools: ["grep"],
    matches: (command) => hasCommand(command, "grep") || hasCommand(command, "rg"),
    text: "[Hint: Prefer the grep tool for content search.]",
  },
  {
    tools: ["read", "edit"],
    matches: (command) =>
      hasCommand(command, "sed") && !/\s-i(\s|$)/i.test(command) && /-n|p['"]?$/i.test(command),
    text: "[Hint: Prefer the read tool for file inspection and the edit tool for changes.]",
  },
  {
    tools: ["find"],
    matches: (command) => /^\s*find\s+/i.test(command) && !/\s-exec\s/i.test(command),
    text: "[Hint: Prefer the dedicated file-search tools for repository discovery.]",
  },
];

/**
 * Each pipeline's first command, joined: `npm test | grep x` filters output and searches no files, so it reads as `npm test`.
 * shortcut: splits on `|`, `;`, `&&` and `||` even inside quotes, so `echo "a; grep x"` yields a false head; use a bash parser if a miss turns up.
 */
export const pipelineHeads = (command: string): string =>
  command.split(/&&|\|\||;|\n/).map((part) => part.split("|")[0].trim()).filter(Boolean).join("; ");

export function getBashAntiPatternHint(command: string, activeTools: readonly string[]): string | null {
  const heads = pipelineHeads(command);
  const hint = HINTS.find(
    ({ tools, matches }) => tools.every((tool) => activeTools.includes(tool)) && matches(heads),
  );
  return hint?.text ?? null;
}
