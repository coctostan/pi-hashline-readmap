import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerReadTool } from "./src/read.js";
import { registerEditTool } from "./src/edit.js";
import { registerGrepTool } from "./src/grep.js";
import { registerSgTool, isSgAvailable } from "./src/sg.js";
import { registerNuTool } from "./src/nu.js";
import { registerWriteTool } from "./src/write.js";
import { registerLsTool } from "./src/ls.js";
import { registerFindTool } from "./src/find.js";
import { registerBashRendererTool } from "./src/bash-renderer.js";
import { resolveShellPath } from "./src/hashline-settings.js";
import { filterBashOutput } from "./src/rtk/bash-filter.js";
import { buildRtkCompaction } from "./src/rtk/rtk-compaction.js";
import { ensureBashOriginalOutputSnapshot, selectBashOriginalOutput } from "./src/rtk/bash-original-output.js";
import { applyBashContextGuard, resolveBashContextGuardConfig, type BashContextGuardConfig } from "./src/rtk/bash-context-guard.js";
import { applyContextHygieneStaleContext } from "./src/context-application.js";
import { buildBashCommandState } from "./src/bash-command-state.js";
import {
  buildCommandResource,
  buildContextHygieneMetadata,
  buildFileResource,
  getContextHygieneTracker,
  normalizePathForContextHygiene,
  registerContextHygieneDebugTool,
  resetContextHygieneTracker,
  type ContextHygieneAppliedEffects,
  type ContextHygieneEvent,
  type ContextHygieneMetadata,
  type ContextHygieneResource,
} from "./src/context-hygiene.js";
import {
  consumeDoomLoopWarning,
  createDoomLoopState,
  formatDoomLoopMessage,
  recordToolCall,
} from "./src/doom-loop.js";

function isBashToolResult(event: unknown): event is {
  toolName: string;
  toolCallId: string;
  input?: unknown;
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
  details?: unknown;
} {
  return !!event && typeof event === "object" && (event as { toolName?: unknown }).toolName === "bash";
}

function isContextHygieneResource(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const resource = value as { kind?: unknown; key?: unknown };
  return (
    (resource.kind === "file" || resource.kind === "symbol" || resource.kind === "command") &&
    typeof resource.key === "string"
  );
}

function isContextHygieneMetadata(value: unknown): value is ContextHygieneMetadata {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Partial<ContextHygieneMetadata>;
  return (
    metadata.schemaVersion === 1 &&
    typeof metadata.tool === "string" &&
    (metadata.classification === "read-context" ||
      metadata.classification === "search-context" ||
      metadata.classification === "command-output" ||
      metadata.classification === "mutation") &&
    Array.isArray(metadata.resources) &&
    metadata.resources.every(isContextHygieneResource)
  );
}

function contextHygieneFromDetails(details: unknown): ContextHygieneMetadata | undefined {
  if (!details || typeof details !== "object") return undefined;
  const metadata = (details as { contextHygiene?: unknown }).contextHygiene;
  return isContextHygieneMetadata(metadata) ? metadata : undefined;
}

function recordContextHygiene(metadata: ContextHygieneMetadata, toolCallId: unknown): ContextHygieneEvent {
  return getContextHygieneTracker().record(metadata, {
    resultId: typeof toolCallId === "string" ? toolCallId : undefined,
  });
}

function buildAppliedEffectsBucket(resultIds: Set<string>, reasons: Set<string>) {
  return {
    count: resultIds.size,
    resultIds: [...resultIds].sort(),
    reasons: [...reasons].sort(),
  };
}

const BASH_CURRENT_TURN_STALE_REASONS = new Set([
  "bash-repo-state-after-mutation",
  "bash-verification-success-rerun",
]);
function summarizeBashAppliedEffects(eventId: number): ContextHygieneAppliedEffects {
  const report = getContextHygieneTracker().generateReport();
  const retiredResultIds = new Set<string>();
  const retiredReasons = new Set<string>();
  const staleResultIds = new Set<string>();
  const staleReasons = new Set<string>();

  for (const candidate of report.retirementCandidates) {
    if (candidate.supersededByEventId !== eventId) continue;
    for (const record of candidate.retiredResults ?? []) {
      if (record.originalTool !== "bash" || !record.originalResultId) continue;
      retiredResultIds.add(record.originalResultId);
      retiredReasons.add(record.reason);
    }
  }

  for (const candidate of report.staleCandidates) {
    if (candidate.mutationEventId !== eventId || !BASH_CURRENT_TURN_STALE_REASONS.has(candidate.reason)) continue;
    for (const record of candidate.staleResults) {
      if (record.originalTool !== "bash" || !record.originalResultId) continue;
      staleResultIds.add(record.originalResultId);
      staleReasons.add(record.reason);
    }
  }

  return {
    retired: buildAppliedEffectsBucket(retiredResultIds, retiredReasons),
    stale: buildAppliedEffectsBucket(staleResultIds, staleReasons),
  };
}

function hasAppliedEffects(effects: ContextHygieneAppliedEffects): boolean {
  return effects.retired.count > 0 || effects.stale.count > 0;
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
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function buildRtkNotice(
  info: {
    originalBytes: number;
    outputBytes: number;
    compressionRatio: number;
    technique: string;
    bypassedBy?: string;
  },
  command: string,
  outputIsEmpty: boolean,
): string | null {
  if (info.bypassedBy !== undefined) return null;
  if (outputIsEmpty) return null;
  if (info.originalBytes <= 2000) return null;
  if (info.compressionRatio >= 0.5) return null;
  const pct = Math.round((1 - info.compressionRatio) * 100);
  return `[RTK: compressed ${info.technique} output ${formatBytes(info.originalBytes)} → ${formatBytes(info.outputBytes)} (${pct}% saved). Use \`PI_RTK_BYPASS=1 ${command}\` to see full output.]`;
}

function willBashContextGuardTrim(text: string, config: BashContextGuardConfig): boolean {
  return config.enabled && text !== "" && (text.split("\n").length > config.maxLines || Buffer.byteLength(text, "utf8") > config.maxBytes);
}

export default function piHashlineReadmapExtension(pi: ExtensionAPI): void {
  // readTurns maps an absolute path to the tracker event id of the most recent
  // live-anchor tool result for that path (read / grep / ast_search / write).
  // When the provider-context handler masks a prior live-anchor read into a
  // stale placeholder, we expire the corresponding entry so wasReadInSession
  // stops returning true until the agent re-reads the file.
  const readTurns = new Map<string, number>();
  const doomLoopState = createDoomLoopState();
  resetContextHygieneTracker();
  const readTurnKey = (absolutePath: string) => normalizePathForContextHygiene(absolutePath);
  const noteRead = (absolutePath: string) => {
    // noteRead is invoked synchronously from inside read/grep/ast_search/write
    // BEFORE the tool result is dispatched to the tool_result handler that
    // calls tracker.record(). So the just-finishing tool's event will receive
    // id = report.eventCount + 1 once tool_result fires. We anchor readTurns
    // to that anticipated id so the entry is strictly newer than every
    // mutation event id <= the current eventCount, which is exactly what
    // expireStaleReadTurns compares against.
    const tracker = getContextHygieneTracker();
    const report = tracker.generateReport();
    const eventId = report.eventCount + 1;
    readTurns.set(readTurnKey(absolutePath), eventId);
  };
  const wasReadInSession = (absolutePath: string) => readTurns.has(readTurnKey(absolutePath));

  const readTool = registerReadTool(pi, { onSuccessfulRead: noteRead });
  const editTool = registerEditTool(pi, { wasReadInSession });
  const sgAvailable = isSgAvailable();
  const astSearchGuideline = sgAvailable
    ? "Use grep summary for counts; use ast_search for structural code patterns."
    : "Use grep summary for counts; install ast-grep to enable ast_search.";

  const grepTool = registerGrepTool(pi, { astSearchGuideline, onFileAnchored: noteRead });
  const sgTool = registerSgTool(pi, { onFileAnchored: noteRead });
  const nuTool = registerNuTool(pi);
  const writeTool = registerWriteTool(pi, { onFileAnchored: noteRead });
  const lsTool = registerLsTool(pi);
  const findTool = registerFindTool(pi);
  registerBashRendererTool(pi, { cwd: process.cwd(), shellPath: resolveShellPath() });
  const contextHygieneDebugTool = registerContextHygieneDebugTool(pi);
  const toolExecutors = {
    read: readTool,
    edit: editTool,
    grep: grepTool,
    ast_search: sgTool,
    write: writeTool,
    ls: lsTool,
    find: findTool,
    ...(nuTool ? { nu: nuTool } : {}),
    ...(contextHygieneDebugTool ? { context_hygiene_report: contextHygieneDebugTool } : {}),
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

  // Expire readTurns entries whose tracked live-anchor event id has been
  // superseded by a later same-file mutation (i.e. the prior read has been
  // masked into a stale placeholder by applyContextHygieneStaleContext).
  // After expiry, edit's read-before-edit guard correctly forces a re-read.
  const expireStaleReadTurns = (
    report: ReturnType<ReturnType<typeof getContextHygieneTracker>["generateReport"]>,
  ) => {
    if (readTurns.size === 0) return;
    for (const candidate of report.staleCandidates) {
      if (!candidate.resourceKey.startsWith("file:")) continue;
      const absolutePath = readTurnKey(candidate.resourceKey.slice("file:".length));
      const recordedEventId = readTurns.get(absolutePath);
      if (recordedEventId === undefined) continue;
      if (recordedEventId <= candidate.mutationEventId) {
        readTurns.delete(absolutePath);
      }
    }
  };

  pi.on("context", (event: any): any => {
    if (!Array.isArray(event.messages)) return undefined;
    const report = getContextHygieneTracker().generateReport();
    const messages = applyContextHygieneStaleContext(event.messages, report);
    expireStaleReadTurns(report);
    if (messages === event.messages) return undefined;
    return { messages };
  });

  (pi as any).on("tool_result", (event: any) => {
    const doomLoop = consumeDoomLoopWarning(doomLoopState, event.toolCallId);
    if (!isBashToolResult(event)) {
      const contextHygiene = contextHygieneFromDetails(event.details);
      if (contextHygiene) recordContextHygiene(contextHygiene, event.toolCallId);
      if (!doomLoop || !Array.isArray(event.content)) {
        return undefined;
      }
      const content = [...event.content];
      const prefix = `${formatDoomLoopMessage(doomLoop)}\n\n---\n`;
      let textIndex = -1;
      for (let i = 0; i < content.length; i++) {
        const item = content[i] as { type?: unknown; text?: unknown };
        if (item.type === "text" && typeof item.text === "string") {
          textIndex = i;
          break;
        }
      }
      if (textIndex >= 0) {
        const item = content[textIndex] as { type: "text"; text: string };
        content[textIndex] = { ...item, text: `${prefix}${item.text}` };
      } else {
        content.unshift({ type: "text" as const, text: prefix });
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

    const nonTextContent = Array.isArray(event.content)
      ? (event.content as Array<{ type?: unknown; text?: unknown }>).filter(
          (c) => !(c.type === "text" && typeof c.text === "string"),
        )
      : [];

    const existingDetails =
      event.details && typeof event.details === "object" ? (event.details as Record<string, unknown>) : {};
    const bashContextGuardConfig = resolveBashContextGuardConfig();
    const originalSelection = selectBashOriginalOutput({
      visibleText: originalText,
      fullOutputPath: existingDetails.fullOutputPath,
      enabled: bashContextGuardConfig.enabled,
    });

    const command =
      event.input && typeof event.input === "object" && typeof (event.input as { command?: unknown }).command === "string"
        ? (event.input as { command: string }).command
        : "";
    const commandState = command
      ? buildBashCommandState({
          command,
          cwd: process.cwd(),
          isError: event.isError === true,
          text: originalSelection.inputForRtk || originalText,
        })
      : undefined;
    const contextHygieneResources: ContextHygieneResource[] = command ? [buildCommandResource(command)] : [];
    for (const fileTarget of commandState?.fileTargets ?? []) {
      contextHygieneResources.push(buildFileResource(fileTarget));
    }
    const contextHygiene = buildContextHygieneMetadata({
      tool: "bash",
      classification: commandState?.stateKind === "shell-file-mutation" ? "mutation" : "command-output",
      resources: contextHygieneResources,
      commandState,
    });
    const recordedContextHygieneEvent = recordContextHygiene(contextHygiene, event.toolCallId);
    if (
      event.isError !== true &&
      commandState?.stateKind === "shell-file-mutation" &&
      (commandState.fileTargets?.length ?? 0) > 0
    ) {
      expireStaleReadTurns(getContextHygieneTracker().generateReport());
    }
    const appliedEffects = summarizeBashAppliedEffects(recordedContextHygieneEvent.id);
    const contextHygieneForDetails: ContextHygieneMetadata = hasAppliedEffects(appliedEffects)
      ? { ...contextHygiene, appliedEffects }
      : contextHygiene;
    const applyWarning = (body: string): string => {
      if (!doomLoop) return body;
      const prefix = `${formatDoomLoopMessage(doomLoop)}\n\n---\n`;
      return `${prefix}${body}`;
    };
    const { output, savedChars, info } = filterBashOutput(command, originalSelection.inputForRtk);
    if (process.env.PI_RTK_SAVINGS === "1") {
      process.stderr.write(`[RTK] Saved ${savedChars} chars (${command})\n`);
    }
    const notice = buildRtkNotice(info, command, output === "");
    const body = notice ? `${notice}\n${output}` : output;
    const finalText = applyWarning(body);
    const originalMetadataForGuard = willBashContextGuardTrim(finalText, bashContextGuardConfig)
      ? ensureBashOriginalOutputSnapshot({
          visibleText: originalText,
          metadata: originalSelection.metadata,
          enabled: bashContextGuardConfig.enabled,
        })
      : originalSelection.metadata;
    const guarded = applyBashContextGuard({
      text: finalText,
      command,
      originalMetadata: originalMetadataForGuard,
      config: bashContextGuardConfig,
    });
    const bashOriginalOutput = guarded.metadata.trimmed ? originalMetadataForGuard : originalSelection.metadata;
    const rtkCompaction = buildRtkCompaction({
      rawInput: originalSelection.inputForRtk,
      output,
      info,
    });
    const existingPtcValue =
      existingDetails.ptcValue && typeof existingDetails.ptcValue === "object"
        ? (existingDetails.ptcValue as Record<string, unknown>)
        : {};
    return {
      content: [{ type: "text" as const, text: guarded.text }, ...nonTextContent],
      details: {
        ...existingDetails,
        compressionInfo: info,
        contextHygiene: contextHygieneForDetails,
        bashContextGuard: guarded.metadata,
        ...(bashOriginalOutput ? { bashOriginalOutput } : {}),
        rtkCompaction,
        ptcValue: { ...existingPtcValue, rtkCompaction },
      },
    };
  });
}
