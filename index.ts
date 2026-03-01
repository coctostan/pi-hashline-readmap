import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isBashToolResult } from "@mariozechner/pi-coding-agent";
import { registerReadTool } from "./src/read.js";
import { registerEditTool } from "./src/edit.js";
import { registerGrepTool } from "./src/grep.js";
import { registerSgTool } from "./src/sg.js";
import { filterBashOutput } from "./src/rtk/bash-filter.js";

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

    const { output } = filterBashOutput(command, originalText);

    return {
      content: [{ type: "text" as const, text: output }],
    };
  });
}
