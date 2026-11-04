import { stripAnsi } from "./ansi.js";
import { getBashAntiPatternHint } from "./bash-anti-pattern-hints.js";

/** What the model reads of a bash result: Pi's own text, ANSI stripped, plus any hint naming an active tool. */
export function presentBashOutput(command: string, output: string, activeTools: readonly string[]): string {
  const text = stripAnsi(output);
  const hint = getBashAntiPatternHint(command, activeTools);
  if (!hint) return text;
  return text ? `${text}\n\n${hint}` : hint;
}
