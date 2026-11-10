import { stripAnsi } from "./ansi.js";
import { getBashAntiPatternHint } from "./bash-anti-pattern-hints.js";

const TIMEOUT_HINT = "[Hint: This shell has no `timeout` command; set the bash tool's `timeout` parameter (seconds) instead.]";

/**
 * What the model reads of a bash result: Pi's own text, ANSI stripped, plus any hint naming an active tool,
 * then, whatever tools are active, a pointer to bash's own `timeout` parameter when the shell lacks the command.
 */
export function presentBashOutput(command: string, output: string, activeTools: readonly string[]): string {
  const text = stripAnsi(output);
  const missingTimeout = text.includes("timeout: command not found");
  return [text, getBashAntiPatternHint(command, activeTools), missingTimeout ? TIMEOUT_HINT : null]
    .filter(Boolean)
    .join("\n\n");
}
