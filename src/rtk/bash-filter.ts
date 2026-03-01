import { stripAnsi } from "./ansi.js";

export interface FilterResult {
  output: string;
  savedChars: number;
}

export function filterBashOutput(command: string, output: string): FilterResult {
  if (output === "") {
    return { output: "", savedChars: 0 };
  }

  const stripped = stripAnsi(output);
  return {
    output: stripped,
    savedChars: output.length - stripped.length,
  };
}
