import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isBashToolResult } from "@mariozechner/pi-coding-agent";
import { registerReadTool } from "./src/read.js";
import { registerEditTool } from "./src/edit.js";
import { registerGrepTool } from "./src/grep.js";
import { registerSgTool } from "./src/sg.js";
import { filterBashOutput } from "./src/rtk/bash-filter.js";
import { stripAnsi } from "./src/rtk/ansi.js";

// Set to false to disable semantic compression (test summaries, git, build, etc.).
// ANSI stripping always runs regardless.
const BASH_FILTER_ENABLED = true;

export default function piHashlineReadmapExtension(pi: ExtensionAPI): void {
  registerReadTool(pi);
  registerEditTool(pi);
  registerGrepTool(pi);
  registerSgTool(pi);

  pi.on("tool_result", (event) => {
    if (!isBashToolResult(event)) {
      return undefined;
    }

    const command = (event.input as { command?: string }).command ?? "";
    const originalText = event.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    if (!BASH_FILTER_ENABLED) {
      const stripped = stripAnsi(originalText);
      if (stripped === originalText) return undefined;
      return { content: [{ type: "text" as const, text: stripped }] };
    }

    const { output, savedChars } = filterBashOutput(command, originalText);
    if (process.env.PI_RTK_SAVINGS === "1") {
      process.stderr.write(`[RTK] Saved ${savedChars} chars (${command})\n`);
    }
    return {
      content: [{ type: "text" as const, text: output }],
    };
  });
}
