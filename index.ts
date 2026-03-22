import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerReadTool } from "./src/read.js";
import { registerEditTool } from "./src/edit.js";
import { registerGrepTool } from "./src/grep.js";
import { registerSgTool } from "./src/sg.js";
import { filterBashOutput } from "./src/rtk/bash-filter.js";
import { stripAnsi } from "./src/rtk/ansi.js";

// Compatibility note:
// - Upstream @mariozechner/pi-coding-agent exports isBashToolResult in newer builds.
// - GSD aliases that package name to its vendored @gsd/pi-coding-agent, whose public
//   root export surface differs and does not export isBashToolResult.
// Keep this local guard instead of importing the helper so the extension works in both runtimes.
function isBashToolResult(event: unknown): event is {
  toolName: string;
  input: { command?: string };
  content: Array<{ type: string; text?: string }>;
} {
  return !!event && typeof event === "object" && (event as { toolName?: unknown }).toolName === "bash";
}

export {
  HASHLINE_TOOL_PTC_POLICY,
  getHashlineToolPtcPolicy,
} from "./src/ptc-tool-policy.js";
export type {
  HashlineToolDefaultExposure,
  HashlineToolMutability,
  HashlineToolName,
  HashlineToolPtcPolicy,
  HashlineToolPtcPolicyEntry,
} from "./src/ptc-tool-policy.js";

// Set to false to disable semantic compression (test summaries, git, build, etc.).
// ANSI stripping always runs regardless.
const BASH_FILTER_ENABLED = true;

export default function piHashlineReadmapExtension(pi: ExtensionAPI): void {
  const readTool = registerReadTool(pi);
  const editTool = registerEditTool(pi);
  const grepTool = registerGrepTool(pi);
  const sgTool = registerSgTool(pi);

  const toolExecutors = {
    read: readTool,
    edit: editTool,
    grep: grepTool,
    sg: sgTool,
  };

  (globalThis as any).__hashlineToolExecutors = toolExecutors;
  pi.events.emit("hashline:tool-executors", toolExecutors);
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
