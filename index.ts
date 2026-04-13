import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerReadTool } from "./src/read.js";
import { registerEditTool } from "./src/edit.js";
import { registerGrepTool } from "./src/grep.js";
import { registerSgTool, isSgAvailable } from "./src/sg.js";
import { registerNuTool } from "./src/nu.js";
import { registerWriteTool } from "./src/write.js";
import { registerLsTool } from "./src/ls.js";
import { registerFindTool } from "./src/find.js";
import { filterBashOutput } from "./src/rtk/bash-filter.js";
import { stripAnsi } from "./src/rtk/ansi.js";
import {
  appendDoomLoopWarning,
  consumeDoomLoopWarning,
  createDoomLoopState,
  recordToolCall,
} from "./src/doom-loop.js";

function isBashToolResult(event: unknown): event is {
  toolName: string;
  toolCallId: string;
  input: { command?: string };
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
  details?: unknown;
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

const BASH_FILTER_ENABLED = true;

export default function piHashlineReadmapExtension(pi: ExtensionAPI): void {
  const readTurns = new Map<string, number>();
  let currentTurn = 0;
  const doomLoopState = createDoomLoopState();
  const noteRead = (absolutePath: string) => {
    currentTurn += 1;
    readTurns.set(absolutePath, currentTurn);
  };
  const wasReadInSession = (absolutePath: string) => readTurns.has(absolutePath);

  const readTool = registerReadTool(pi, { onSuccessfulRead: noteRead });
  const editTool = registerEditTool(pi, { wasReadInSession });
  const sgAvailable = isSgAvailable();
  const astSearchGuideline = sgAvailable
    ? 'Use `ast_search` for structural code patterns (function calls, imports, JSX). Use `grep` for text matching.'
    : 'For AST-aware structural code search (function calls, imports, JSX elements), install ast-grep: `brew install ast-grep`';

  const grepTool = registerGrepTool(pi, { astSearchGuideline });
  const sgTool = registerSgTool(pi);
  registerNuTool(pi);
  const writeTool = registerWriteTool(pi);
  registerLsTool(pi);
  registerFindTool(pi);

  const toolExecutors = {
    read: readTool,
    edit: editTool,
    grep: grepTool,
    ast_search: sgTool,
    write: writeTool,
  };

  (globalThis as any).__hashlineToolExecutors = toolExecutors;
  pi.events.emit("hashline:tool-executors", toolExecutors);

  pi.on("tool_call", (event: any) => {
    recordToolCall(
      doomLoopState,
      event.toolName,
      event.toolCallId,
      (event.input ?? {}) as Record<string, unknown>,
    );
    return undefined;
  });

  pi.on("tool_result", (event: any) => {
    const doomLoop = consumeDoomLoopWarning(doomLoopState, event.toolCallId);
    if (!isBashToolResult(event)) {
      if (!doomLoop || !Array.isArray(event.content)) {
        return undefined;
      }
      const content = [...event.content];
      let textIndex = -1;
      for (let i = content.length - 1; i >= 0; i--) {
        const item = content[i] as { type?: unknown; text?: unknown };
        if (item.type === "text" && typeof item.text === "string") {
          textIndex = i;
          break;
        }
      }
      if (textIndex >= 0) {
        const item = content[textIndex] as { type: "text"; text: string };
        content[textIndex] = { ...item, text: appendDoomLoopWarning(item.text) };
      } else {
        content.push({ type: "text" as const, text: appendDoomLoopWarning("") });
      }
      return {
        content,
        details: event.details,
        isError: event.isError,
      };
    }
    const originalText = Array.isArray(event.content)
      ? (event.content as Array<{ type?: unknown; text?: unknown }>)
          .filter((c): c is { type: "text"; text: string } => c.type === "text" && typeof c.text === "string")
          .map((c) => c.text)
          .join("\n")
      : "";

    const command = (event.input as { command?: string }).command ?? "";

    if (!BASH_FILTER_ENABLED) {
      const stripped = stripAnsi(originalText);
      const text = doomLoop ? appendDoomLoopWarning(stripped) : stripped;
      if (text === originalText) return undefined;
      return { content: [{ type: "text" as const, text }] };
    }

    const { output, savedChars } = filterBashOutput(command, originalText);
    if (process.env.PI_RTK_SAVINGS === "1") {
      process.stderr.write(`[RTK] Saved ${savedChars} chars (${command})\n`);
    }

    return {
      content: [{ type: "text" as const, text: doomLoop ? appendDoomLoopWarning(output) : output }],
    };
  });
}
