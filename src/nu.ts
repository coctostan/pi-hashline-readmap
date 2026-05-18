import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { buildPtcError } from "./ptc-value.js";
import { stripAnsi } from "./rtk/ansi.js";
import { defineToolPromptMetadata } from "./tool-prompt-metadata.js";
import { clampLineToWidth, clampLinesToWidth, isRendererExpanded, renderToolLabel, summaryLine } from "./tui-render-utils.js";
import { executableCommand, resolveBundledBin } from "./binary-resolution.js";

const MAX_LINES = 2000;
const MAX_BYTES = 50 * 1024; // 50 KB

/**
 * Check if the `nu` (Nushell) binary is available in PATH.
 * Runs `nu --version` synchronously with a 3-second timeout.
 */
export function resolveNuBinary(): string {
  return resolveBundledBin("nushell", "nu", "nu");
}

export function isNuAvailable(): boolean {
  try {
    const binary = executableCommand(resolveNuBinary());
    execFileSync(binary.command, [...binary.argsPrefix, "--version"], { timeout: 3000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Truncate output to match bash tool limits: 2000 lines or 50KB.
 * Line truncation is applied before byte truncation.
 */
export function truncateNuOutput(text: string): string {
  const lines = text.split("\n");
  if (lines.length > MAX_LINES) {
    text =
      lines.slice(0, MAX_LINES).join("\n") +
      `\n[… ${lines.length - MAX_LINES} more lines truncated]`;
  }
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > MAX_BYTES) {
    text =
      Buffer.from(text, "utf8").subarray(0, MAX_BYTES).toString("utf8") +
      "\n[… truncated at 50 KB]";
  }
  return text;
}

export interface NuExecuteOptions {
  command: string;
  cwd: string;
  timeoutSeconds?: number;
  signal?: AbortSignal;
  onUpdate?: (output: string) => void;
}

export interface NuExecuteResult {
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}

/**
 * Resolve nushell CLI arguments for config and plugin loading.
 *
 * Priority:
 *   1. PI_NUSHELL_CONFIG env var → --config <path>
 *   2. ~/.config/pi/nushell/config.nu if it exists → --config <path>
 *   3. --no-config-file (clean, no plugins)
 */
export function resolveNuArgs(): string[] {
  // Priority 1: Explicit env var override
  if (process.env.PI_NUSHELL_CONFIG) {
    return ["--config", process.env.PI_NUSHELL_CONFIG];
  }

  // Priority 2: Pi-specific config at well-known path
  const piConfig = join(homedir(), ".config", "pi", "nushell", "config.nu");
  if (existsSync(piConfig)) {
    return ["--config", piConfig];
  }

  // Priority 3: Clean slate — fast, predictable, no plugins
  return ["--no-config-file"];
}

function terminateNuProcess(proc: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  try {
    if (process.platform !== "win32" && proc.pid) {
      process.kill(-proc.pid, signal);
      return;
    }
  } catch {
    // Fall back to terminating the direct child below.
  }

  try {
    proc.kill(signal);
  } catch {
    // Process may already be dead.
  }
}
/**
 * Execute a Nushell script via a temp file.
 * Streams partial output, handles timeout/abort, strips ANSI, truncates.
 */
export async function executeNuScript(opts: NuExecuteOptions): Promise<NuExecuteResult> {
  const { command, cwd, timeoutSeconds = 30, signal, onUpdate } = opts;
  const timeoutMs = timeoutSeconds * 1000;

  // Short-circuit if already aborted
  if (signal?.aborted) {
    return { output: "(aborted)", exitCode: -1, timedOut: false };
  }

  const tmpFile = join(tmpdir(), `pi-nu-${randomBytes(8).toString("hex")}.nu`);

  const cleanup = () => {
    try {
      unlinkSync(tmpFile);
    } catch {
      // best-effort
    }
  };

  // Safely write temp file with restrictive permissions
  try {
    writeFileSync(tmpFile, command, { encoding: "utf8", mode: 0o600 });
  } catch (err: unknown) {
    cleanup(); // remove partial temp file if any
    const msg = err instanceof Error ? err.message : String(err);
    return { output: `Error writing temp file: ${msg}`, exitCode: -1, timedOut: false };
  }

  const args = [...resolveNuArgs(), tmpFile];

  return new Promise<NuExecuteResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = (result: NuExecuteResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", abort);
      cleanup();
      resolve(result);
    };

    // Wrap spawn in try/catch for sync failures (e.g. invalid cwd)
    let proc;
    try {
      const binary = executableCommand(resolveNuBinary());
      proc = spawn(binary.command, [...binary.argsPrefix, ...args], {
        cwd,
        env: { ...process.env },
        detached: process.platform !== "win32",
      });
    } catch (err: unknown) {
      cleanup();
      const msg = err instanceof Error ? err.message : String(err);
      resolve({ output: `Error spawning nushell: ${msg}`, exitCode: -1, timedOut: false });
      return;
    }

    // SIGTERM → 2s grace → SIGKILL escalation to prevent hanging
    const forceKill = () => {
      killTimer = setTimeout(() => {
        terminateNuProcess(proc, "SIGKILL");
      }, 2000);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      terminateNuProcess(proc, "SIGTERM");
      forceKill();
    }, timeoutMs);

    const abort = () => {
      clearTimeout(timer);
      terminateNuProcess(proc, "SIGTERM");
      forceKill();
    };
    signal?.addEventListener("abort", abort, { once: true });

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      onUpdate?.(truncateNuOutput(stdout));
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    proc.on("close", (code) => {
      let output = stdout;
      if (stderr) {
        output += (output ? "\n\nstderr:\n" : "") + stderr;
      }
      if (timedOut) {
        output = `[timed out after ${timeoutSeconds}s]\n` + output;
      }

      output = truncateNuOutput(stripAnsi(output.trim())) || "(no output)";

      settle({ output, exitCode: timedOut ? -1 : code, timedOut });
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      const hint =
        err.code === "ENOENT"
          ? "\n\nHint: bundled npm package 'nushell' was unavailable or unusable. Run npm install, or install Nushell on PATH as a fallback: https://www.nushell.sh/"
          : "";
      settle({
        output: `Error spawning nushell: ${err.message}${hint}`,
        exitCode: -1,
        timedOut: false,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Error-driven hints (Tier 2 — appended to execute() output on failure only)
// ---------------------------------------------------------------------------

/**
 * Substring → hint map. When a `nu` invocation fails (non-zero exit or timeout)
 * and the merged output contains one of these needles, the matching hint is
 * appended to the returned text by `augmentNuOutput`. Not injected into the
 * prompt; agents see hints only on failure.
 */
export const NU_ERROR_HINTS: Record<string, string> = {
  "command not found: gstat":
    "gstat requires nu_plugin_gstat. Install: `cargo install nu_plugin_gstat` then `plugin add <path>` inside nu.",
  "command not found: query":
    "query requires nu_plugin_query (supports `query json <jsonpath>`, `query xml <xpath>`, `query web <css>`). Install: `cargo install nu_plugin_query` then `plugin add <path>` inside nu.",
  "command not found: from ini":
    "INI/plist parsing requires nu_plugin_formats. Install: `cargo install nu_plugin_formats` then `plugin add <path>` inside nu.",
};

/**
 * Append a `[nu-hint] <text>` line to `result.output` for each known needle
 * that appears in the output, but only when the invocation failed
 * (`exitCode !== 0` or `timedOut`). Returns the output unchanged on success
 * or when no needle matches.
 */
export function augmentNuOutput(result: NuExecuteResult): string {
  const failed = result.exitCode !== 0 || result.timedOut;
  if (!failed) return result.output;

  const hints: string[] = [];
  for (const [needle, hint] of Object.entries(NU_ERROR_HINTS)) {
    if (result.output.includes(needle)) {
      hints.push(`[nu-hint] ${hint}`);
    }
  }
  if (hints.length === 0) return result.output;
  return `${result.output}\n\n${hints.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Prompt & registration
// ---------------------------------------------------------------------------

const NU_SNIPPET =
  "Structured exploration shell — file inspection, data wrangling, system queries via Nushell pipelines. Use bash for project commands.";

export const NU_GUIDELINES = [
  "Use nu for structured data, filesystem metadata, and system inspection.",
];

const NU_PROMPT_METADATA = defineToolPromptMetadata({
  promptUrl: new URL("../prompts/nu.md", import.meta.url),
  promptSnippet: NU_SNIPPET,
  promptGuidelines: NU_GUIDELINES,
});

export const NU_PTC = {
  callable: true,
  enabled: true,
  policy: "read-only" as const,
  readOnly: true,
  pythonName: "nu",
  defaultExposure: "opt-in" as const,
};

/**
 * Register the `nu` tool with pi. Returns the tool definition if registered, false if nu is not available.
 */
export type NuToolDefinition = Parameters<ExtensionAPI["registerTool"]>[0] & { ptc: typeof NU_PTC };

export function registerNuTool(pi: ExtensionAPI): NuToolDefinition | false {
  if (!isNuAvailable()) {
    return false;
  }
  const tool = {
    name: "nu",
    label: "nushell",
    description: NU_PROMPT_METADATA.description,
    promptSnippet: NU_PROMPT_METADATA.promptSnippet,
    promptGuidelines: NU_PROMPT_METADATA.promptGuidelines,
    ptc: NU_PTC,
    parameters: Type.Object({
      command: Type.String({ description: "Nushell script" }),
      timeout: Type.Optional(
        Type.Number({ description: "Timeout seconds" }),
      ),
    }),
    async execute(_toolCallId, params: { command: string; timeout?: number }, signal, onUpdate, ctx) {
      const result = await executeNuScript({
        command: params.command,
        cwd: ctx.cwd,
        timeoutSeconds: params.timeout ?? 30,
        signal: signal ?? undefined,
        onUpdate: onUpdate
          ? (text) => onUpdate({ content: [{ type: "text", text }], details: {} })
          : undefined,
      });

      const text = augmentNuOutput(result);
      const details = {
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        shell: "nushell",
      };

      let ptcValue;
      if (result.timedOut) {
        ptcValue = {
          tool: "nu",
          ok: false,
          error: buildPtcError(
            "nu-timed-out",
            text,
            `Increase timeout via the 'timeout' parameter (current: ${params.timeout ?? 30}s).`,
            { exitCode: result.exitCode, timedOut: true },
          ),
        };
      } else if (/Error writing temp file:/.test(result.output)) {
        ptcValue = {
          tool: "nu",
          ok: false,
          error: buildPtcError(
            "nu-temp-file-error",
            text,
            undefined,
            { exitCode: result.exitCode, timedOut: false },
          ),
        };
      } else if (
        /Error spawning nushell:/.test(result.output) || /not found in PATH/.test(result.output)
      ) {
        ptcValue = {
          tool: "nu",
          ok: false,
          error: buildPtcError(
            "nu-spawn-error",
            text,
            "Run npm install to install the nushell package, or install Nushell on PATH as a fallback: https://www.nushell.sh/",
            { exitCode: result.exitCode, timedOut: false },
          ),
        };
      } else if (result.exitCode !== 0 || result.exitCode === null) {
        ptcValue = {
          tool: "nu",
          ok: false,
          error: buildPtcError(
            "nu-non-zero-exit",
            text,
            undefined,
            { exitCode: result.exitCode, timedOut: false },
          ),
        };
      } else {
        ptcValue = { tool: "nu", ok: true };
      }
      return {
        content: [{ type: "text" as const, text }],
        details: {
          ...details,
          ptcValue,
        },
      };
    },
    renderCall(args: any, theme: any, context: any = {}) {
      const { command } = args as { command: string };
      const firstLine = command.split("\n")[0];
      const preview = firstLine + (command.includes("\n") ? " …" : "");
      return new Text(clampLineToWidth(`${renderToolLabel(theme, "nu")} ${theme.fg("muted", preview)}`, context.width), 0, 0);
    },
    renderResult(result: any, options: any, theme: any, context: any = {}) {
      const expanded = isRendererExpanded(options, context);
      const width = context.width ?? options?.width;
      const output = result.content[0]?.type === "text" ? (result.content[0] as { type: "text"; text: string }).text : "";
      if (result.isError || context.isError) {
        const firstLine = output.split("\n")[0] || "command failed";
        const body = expanded && output ? output : firstLine;
        return new Text(clampLinesToWidth(summaryLine(body).split("\n"), width).join("\n"), 0, 0);
      }
      if (!output.trim()) return new Text(summaryLine("command completed (no output)"), 0, 0);
      const lineCount = output.split("\n").filter(Boolean).length;
      let text = summaryLine(`${lineCount} ${lineCount === 1 ? "line" : "lines"} returned`, { hidden: !expanded });
      if (expanded) text += `\n${output}`;
      return new Text(clampLinesToWidth(text.split("\n"), width).join("\n"), 0, 0);
    },
  } satisfies NuToolDefinition;
  pi.registerTool(tool);
  return tool;
}
