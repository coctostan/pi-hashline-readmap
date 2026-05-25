/**
 * Phase 0 context-hygiene metadata.
 *
 * This module defines a small, additive metadata contract that tool outputs can
 * attach beside existing details such as `ptcValue`. The metadata is intended
 * for deterministic telemetry and future stale/retirement reasoning only; it
 * must not require parsing rendered display text and it must not change current
 * tool behavior.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { BashCommandState } from "./bash-command-state.js";

export const CONTEXT_HYGIENE_SCHEMA_VERSION = 1 as const;
export const DEFAULT_CONTEXT_HYGIENE_MAX_EVENTS = 1000;

export type ContextHygieneClassification =
  | "read-context"
  | "search-context"
  | "command-output"
  | "mutation";

export type ContextHygieneResourceKind = "file" | "symbol" | "command";

export type ContextHygieneCommandKind =
  | "test"
  | "typecheck"
  | "build"
  | "lint"
  | "vcs"
  | "install"
  | "other";

export interface ContextHygieneFileResource {
  kind: "file";
  key: string;
  path: string;
}

export interface ContextHygieneSymbolResource {
  kind: "symbol";
  key: string;
  path: string;
  symbolName: string;
  symbolKind?: string;
}

export interface ContextHygieneCommandResource {
  kind: "command";
  key: string;
  command: string;
  commandKind: ContextHygieneCommandKind;
}

export type ContextHygieneResource =
  | ContextHygieneFileResource
  | ContextHygieneSymbolResource
  | ContextHygieneCommandResource;

export interface ContextHygieneReadRehydrateInput {
  path: string;
  offset?: number | string;
  limit?: number | string;
  symbol?: string;
  map?: true;
  bundle?: "local";
}

export interface ContextHygieneGrepRehydrateInput {
  pattern: string;
  path?: string;
  glob?: string;
  literal?: true;
  ignoreCase?: true;
  context?: number | string;
  summary?: true;
  scope?: "symbol";
  scopeContext?: number | string;
}

export interface ContextHygieneAstSearchRehydrateInput {
  pattern: string;
  lang?: string;
  path?: string;
}

export interface ContextHygieneReadRehydrateDescriptor {
  tool: "read";
  input: ContextHygieneReadRehydrateInput;
}

export interface ContextHygieneGrepRehydrateDescriptor {
  tool: "grep";
  input: ContextHygieneGrepRehydrateInput;
}

export interface ContextHygieneAstSearchRehydrateDescriptor {
  tool: "ast_search";
  input: ContextHygieneAstSearchRehydrateInput;
}

export type ContextHygieneRehydrateDescriptor =
  | ContextHygieneReadRehydrateDescriptor
  | ContextHygieneGrepRehydrateDescriptor
  | ContextHygieneAstSearchRehydrateDescriptor;

export type ContextHygieneStaleInvalidationReason =
  | "mutation-after-read"
  | "bash-repo-state-after-mutation"
  | "bash-verification-success-rerun";

export type ContextHygieneRetirementReason = "command-rerun" | "same-command-success-rerun";

export interface ContextHygieneStaleRecord {
  status: "stale";
  originalTool: string;
  originalEventId?: number;
  originalResultId?: string;
  staleResourceKeys: string[];
  invalidatingMutationEventId: number;
  invalidatingMutationResultId?: string;
  reason: ContextHygieneStaleInvalidationReason;
  rehydrate?: ContextHygieneRehydrateDescriptor;
  command?: string;
}

export interface ContextHygieneRetiredRecord {
  status: "retired";
  originalTool: string;
  originalEventId?: number;
  originalResultId?: string;
  retiredResourceKeys: string[];
  supersededByEventId: number;
  supersededByResultId?: string;
  reason: ContextHygieneRetirementReason;
  command?: string;
}

export interface BuildStaleContextRecordInput {
  originalTool: string;
  originalEventId?: number;
  originalResultId?: string;
  staleResourceKeys: readonly string[];
  invalidatingMutationEventId: number;
  invalidatingMutationResultId?: string;
  reason?: ContextHygieneStaleInvalidationReason;
  rehydrate?: ContextHygieneRehydrateDescriptor;
  command?: string;
}

export function cloneContextHygieneRehydrateDescriptor(
  descriptor: ContextHygieneRehydrateDescriptor,
): ContextHygieneRehydrateDescriptor {
  switch (descriptor.tool) {
    case "read":
      return { tool: "read", input: { ...descriptor.input } };
    case "grep":
      return { tool: "grep", input: { ...descriptor.input } };
    case "ast_search":
      return { tool: "ast_search", input: { ...descriptor.input } };
  }
}

function cloneBashCommandState(commandState: BashCommandState): BashCommandState {
  return { ...commandState };
}

export function buildRetiredContextRecord(input: {
  originalTool: string;
  originalEventId?: number;
  originalResultId?: string;
  retiredResourceKeys: readonly string[];
  supersededByEventId: number;
  supersededByResultId?: string;
  reason: ContextHygieneRetirementReason;
  command?: string;
}): ContextHygieneRetiredRecord {
  const record: ContextHygieneRetiredRecord = {
    status: "retired",
    originalTool: input.originalTool,
    retiredResourceKeys: sortResourceKeys(new Set(input.retiredResourceKeys)),
    supersededByEventId: input.supersededByEventId,
    reason: input.reason,
  };
  if (input.originalEventId !== undefined) record.originalEventId = input.originalEventId;
  if (input.originalResultId) record.originalResultId = input.originalResultId;
  if (input.supersededByResultId) record.supersededByResultId = input.supersededByResultId;
  if (input.command) record.command = input.command;
  return record;
}

export function buildStaleContextRecord(input: BuildStaleContextRecordInput): ContextHygieneStaleRecord {
  const record: ContextHygieneStaleRecord = {
    status: "stale",
    originalTool: input.originalTool,
    staleResourceKeys: sortResourceKeys(new Set(input.staleResourceKeys)),
    invalidatingMutationEventId: input.invalidatingMutationEventId,
    reason: input.reason ?? "mutation-after-read",
  };
  if (input.originalEventId !== undefined) record.originalEventId = input.originalEventId;
  if (input.originalResultId) record.originalResultId = input.originalResultId;
  if (input.invalidatingMutationResultId) record.invalidatingMutationResultId = input.invalidatingMutationResultId;
  if (input.rehydrate) record.rehydrate = cloneContextHygieneRehydrateDescriptor(input.rehydrate);
  if (input.command) record.command = input.command;
  return record;
}

export function renderStaleReadPlaceholder(): string {
  return "[Stale read result — this earlier read was superseded by a later file change; nothing is wrong with read. Run read again for current content.]";
}

export function renderStaleGrepPlaceholder(): string {
  return "[Stale grep result — this earlier grep was superseded by a later file change; nothing is wrong with grep. Run grep again for current matches.]";
}

export function renderStaleAstSearchPlaceholder(): string {
  return "[Stale ast_search result — this earlier ast_search was superseded by a later file change; nothing is wrong with ast_search. Run ast_search again for current matches.]";
}

export function renderStaleBashPlaceholder(record: ContextHygieneStaleRecord): string {
  const command = record.command ? ` Command: ${record.command}` : "";
  return `[Stale bash context: ${record.reason}. Re-run the Bash command to refresh.${command}]`;
}

export function renderRetiredContextPlaceholder(record: ContextHygieneRetiredRecord): string {
  const command = record.command ? ` Command: ${record.command}` : "";
  return `[Retired bash context: ${record.reason}. Superseded by a later successful Bash command.${command}]`;
}

export function renderStaleContextPlaceholder(record: ContextHygieneStaleRecord): string {
  switch (record.originalTool) {
    case "read":
      return renderStaleReadPlaceholder();
    case "grep":
      return renderStaleGrepPlaceholder();
    case "ast_search":
      return renderStaleAstSearchPlaceholder();
    case "bash":
      return renderStaleBashPlaceholder(record);
    default:
      return "[Stale tool context: resource content changed after this result. Re-run the original tool to refresh.]";
  }
}

export interface BuildReadRehydrateDescriptorInput {
  path: string;
  offset?: number | string;
  limit?: number | string;
  symbol?: string;
  map?: boolean;
  bundle?: "local";
}

export function buildReadRehydrateDescriptor(
  input: BuildReadRehydrateDescriptorInput,
): ContextHygieneReadRehydrateDescriptor {
  const descriptorInput: ContextHygieneReadRehydrateInput = { path: input.path };
  if (input.offset !== undefined) descriptorInput.offset = input.offset;
  if (input.limit !== undefined) descriptorInput.limit = input.limit;
  if (input.symbol !== undefined) descriptorInput.symbol = input.symbol;
  if (input.map === true) descriptorInput.map = true;
  if (input.bundle !== undefined) descriptorInput.bundle = input.bundle;
  return { tool: "read", input: descriptorInput };
}

export interface BuildGrepRehydrateDescriptorInput {
  pattern: string;
  path?: string;
  glob?: string;
  literal?: boolean;
  ignoreCase?: boolean;
  context?: number | string;
  summary?: boolean;
  scope?: "symbol";
  scopeContext?: number | string;
}

export function buildGrepRehydrateDescriptor(
  input: BuildGrepRehydrateDescriptorInput,
): ContextHygieneGrepRehydrateDescriptor {
  const descriptorInput: ContextHygieneGrepRehydrateInput = { pattern: input.pattern };
  if (input.path !== undefined) descriptorInput.path = input.path;
  if (input.glob !== undefined) descriptorInput.glob = input.glob;
  if (input.literal === true) descriptorInput.literal = true;
  if (input.ignoreCase === true) descriptorInput.ignoreCase = true;
  if (input.context !== undefined) descriptorInput.context = input.context;
  if (input.summary === true) descriptorInput.summary = true;
  if (input.scope !== undefined) descriptorInput.scope = input.scope;
  if (input.scopeContext !== undefined) descriptorInput.scopeContext = input.scopeContext;
  return { tool: "grep", input: descriptorInput };
}

export interface BuildAstSearchRehydrateDescriptorInput {
  pattern: string;
  lang?: string;
  path?: string;
}

export function buildAstSearchRehydrateDescriptor(
  input: BuildAstSearchRehydrateDescriptorInput,
): ContextHygieneAstSearchRehydrateDescriptor {
  const descriptorInput: ContextHygieneAstSearchRehydrateInput = { pattern: input.pattern };
  if (input.lang !== undefined) descriptorInput.lang = input.lang;
  if (input.path !== undefined) descriptorInput.path = input.path;
  return { tool: "ast_search", input: descriptorInput };
}

export interface ContextHygieneAppliedEffectsBucket {
  count: number;
  resultIds: string[];
  reasons: string[];
}

export interface ContextHygieneAppliedEffects {
  retired: ContextHygieneAppliedEffectsBucket;
  stale: ContextHygieneAppliedEffectsBucket;
}
export interface ContextHygieneMetadata {
  schemaVersion: typeof CONTEXT_HYGIENE_SCHEMA_VERSION;
  tool: string;
  classification: ContextHygieneClassification;
  resources: ContextHygieneResource[];
  rehydrate?: ContextHygieneRehydrateDescriptor;
  commandState?: BashCommandState;
  appliedEffects?: ContextHygieneAppliedEffects;
}

export interface BuildContextHygieneMetadataInput {
  tool: string;
  classification: ContextHygieneClassification;
  resources?: readonly (ContextHygieneResource | null | undefined)[];
  rehydrate?: ContextHygieneRehydrateDescriptor | null;
  commandState?: BashCommandState | null;
}

export function normalizePathForContextHygiene(path: string): string {
  if (path === "") return "";

  const slashPath = path.replace(/\\+/g, "/");
  const isAbsolute = slashPath.startsWith("/");
  const parts: string[] = [];

  for (const part of slashPath.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") {
        parts.pop();
      } else if (!isAbsolute) {
        parts.push(part);
      }
      continue;
    }
    parts.push(part);
  }

  const normalized = `${isAbsolute ? "/" : ""}${parts.join("/")}`;
  return normalized || (isAbsolute ? "/" : ".");
}

export function buildFileResource(path: string): ContextHygieneFileResource {
  const normalizedPath = normalizePathForContextHygiene(path);
  return {
    kind: "file",
    key: `file:${normalizedPath}`,
    path: normalizedPath,
  };
}

export function buildSymbolResource(
  path: string,
  symbolName: string,
  symbolKind?: string,
): ContextHygieneSymbolResource {
  const normalizedPath = normalizePathForContextHygiene(path);
  const normalizedKind = symbolKind?.trim();
  const keyPayload = JSON.stringify([normalizedPath, normalizedKind ?? "", symbolName]);
  const resource: ContextHygieneSymbolResource = {
    kind: "symbol",
    key: `symbol:${keyPayload}`,
    path: normalizedPath,
    symbolName,
  };
  if (normalizedKind) resource.symbolKind = normalizedKind;
  return resource;
}

export function normalizeCommandForContextHygiene(command: string): string {
  let normalized = "";
  let quote: "'" | '"' | null = null;
  let pendingWhitespace = false;

  for (const char of command.trim()) {
    if (quote) {
      normalized += char;
      if (char === quote) quote = null;
      continue;
    }

    if (char === "'" || char === '"') {
      if (pendingWhitespace && normalized.length > 0) {
        normalized += " ";
        pendingWhitespace = false;
      }
      quote = char;
      normalized += char;
      continue;
    }

    if (/\s/.test(char)) {
      pendingWhitespace = normalized.length > 0;
      continue;
    }

    if (pendingWhitespace) {
      normalized += " ";
      pendingWhitespace = false;
    }
    normalized += char;
  }

  return normalized;
}

export function classifyCommandForContextHygiene(command: string): ContextHygieneCommandKind {
  const normalized = normalizeCommandForContextHygiene(command);

  if (/^(git|gh)\b/.test(normalized)) return "vcs";
  if (/\b(install|ci|add)\b/.test(normalized) && /^(npm|pnpm|yarn|bun)\b/.test(normalized)) return "install";
  if (/\b(typecheck|tsc\b)/.test(normalized)) return "typecheck";
  if (/\b(test|vitest|jest|mocha|tap)\b/.test(normalized)) return "test";
  if (/\b(lint|eslint|biome|prettier)\b/.test(normalized)) return "lint";
  if (/\b(build|tsup|vite build|rollup|webpack|make)\b/.test(normalized)) return "build";

  return "other";
}

export function buildCommandResource(command: string): ContextHygieneCommandResource {
  const normalizedCommand = normalizeCommandForContextHygiene(command);
  const commandKind = classifyCommandForContextHygiene(normalizedCommand);
  return {
    kind: "command",
    key: `command:${commandKind}:${normalizedCommand}`,
    command: normalizedCommand,
    commandKind,
  };
}

export function buildContextHygieneMetadata(
  input: BuildContextHygieneMetadataInput,
): ContextHygieneMetadata {
  const resources: ContextHygieneResource[] = [];
  const seenResourceKeys = new Set<string>();

  for (const resource of input.resources ?? []) {
    if (!resource || seenResourceKeys.has(resource.key)) continue;
    seenResourceKeys.add(resource.key);
    resources.push({ ...resource } as ContextHygieneResource);
  }

  const metadata: ContextHygieneMetadata = {
    schemaVersion: CONTEXT_HYGIENE_SCHEMA_VERSION,
    tool: input.tool,
    classification: input.classification,
    resources,
  };
  if (input.rehydrate) metadata.rehydrate = cloneContextHygieneRehydrateDescriptor(input.rehydrate);
  if (input.commandState) metadata.commandState = cloneBashCommandState(input.commandState);
  return metadata;
}

export interface ContextHygieneRecordOptions {
  resultId?: string;
}

export interface ContextHygieneEvent {
  id: number;
  resultId?: string;
  tool: string;
  classification: ContextHygieneClassification;
  resources: ContextHygieneResource[];
  rehydrate?: ContextHygieneRehydrateDescriptor;
  commandState?: BashCommandState;
}

export interface ContextHygieneReuseReportEntry {
  resourceKey: string;
  count: number;
  eventIds: number[];
  resultIds: string[];
}

export interface ContextHygieneMutationAfterReadReportEntry {
  resourceKey: string;
  readEventIds: number[];
  mutationEventId: number;
}

export interface ContextHygieneStaleCandidateReportEntry {
  resourceKey: string;
  staleEventIds: number[];
  mutationEventId: number;
  reason: ContextHygieneStaleInvalidationReason;
  staleResults: ContextHygieneStaleRecord[];
}

export interface ContextHygieneRetirementCandidateReportEntry {
  resourceKey: string;
  eventIds: number[];
  supersededByEventId: number;
  reason: ContextHygieneRetirementReason;
  retiredResults?: ContextHygieneRetiredRecord[];
}

export interface ContextHygieneReport {
  eventCount: number;
  resourceCount: number;
  readReuse: ContextHygieneReuseReportEntry[];
  commandReruns: ContextHygieneReuseReportEntry[];
  mutationAfterRead: ContextHygieneMutationAfterReadReportEntry[];
  staleCandidates: ContextHygieneStaleCandidateReportEntry[];
  retirementCandidates: ContextHygieneRetirementCandidateReportEntry[];
  churn: {
    byClassification: Record<ContextHygieneClassification, number>;
    byTool: Record<string, number>;
    uniqueResourcesSeen: number;
  };
}

export interface ContextHygieneTracker {
  record(metadata: ContextHygieneMetadata, options?: ContextHygieneRecordOptions): ContextHygieneEvent;
  generateReport(): ContextHygieneReport;
}

export interface CreateContextHygieneTrackerOptions {
  maxEvents?: number;
}

export interface RegisterContextHygieneDebugToolOptions {
  tracker?: ContextHygieneTracker;
  enabled?: boolean;
}

const CONTEXT_HYGIENE_DEBUG_TOOL_PTC = {
  callable: true,
  enabled: true,
  policy: "read-only" as const,
  readOnly: true,
  pythonName: "context_hygiene_report",
  defaultExposure: "safe-by-default" as const,
};

export function isContextHygieneDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PI_CONTEXT_HYGIENE_DEBUG === "1";
}

export function registerContextHygieneDebugTool(
  pi: ExtensionAPI,
  options: RegisterContextHygieneDebugToolOptions = {},
) {
  const enabled = options.enabled ?? isContextHygieneDebugEnabled();
  if (!enabled) return undefined;

  const tracker = options.tracker ?? getContextHygieneTracker();
  const tool = {
    name: "context_hygiene_report",
    label: "Context Hygiene Report",
    description:
      "Debug-only read-only tool. Returns Phase 0 context-hygiene telemetry, stale candidates, and retirement candidates without mutating tracker state.",
    parameters: Type.Object({}),
    ptc: CONTEXT_HYGIENE_DEBUG_TOOL_PTC,
    async execute() {
      const report = tracker.generateReport();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }],
        details: { ptcValue: report },
      };
    },
  } satisfies Parameters<ExtensionAPI["registerTool"]>[0] & { ptc: typeof CONTEXT_HYGIENE_DEBUG_TOOL_PTC };

  pi.registerTool(tool);
  return tool;
}

function resultIdsForEvents(events: ContextHygieneEvent[]): string[] {
  return events.map((event) => event.resultId).filter((resultId): resultId is string => Boolean(resultId));
}

function cloneContextHygieneEvent(event: ContextHygieneEvent): ContextHygieneEvent {
  const cloned: ContextHygieneEvent = {
    ...event,
    resources: event.resources.map((resource) => ({ ...resource } as ContextHygieneResource)),
  };
  if (event.rehydrate) cloned.rehydrate = cloneContextHygieneRehydrateDescriptor(event.rehydrate);
  if (event.commandState) cloned.commandState = cloneBashCommandState(event.commandState);
  return cloned;
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortResourceKeys(keys: Iterable<string>): string[] {
  return [...keys].sort(compareStable);
}

function createEmptyClassificationCounts(): Record<ContextHygieneClassification, number> {
  return {
    "command-output": 0,
    mutation: 0,
    "read-context": 0,
    "search-context": 0,
  };
}

class DefaultContextHygieneTracker implements ContextHygieneTracker {
  private readonly events: ContextHygieneEvent[] = [];
  private readonly maxEvents: number;
  private nextEventId = 1;

  constructor(options: CreateContextHygieneTrackerOptions = {}) {
    this.maxEvents = Math.max(1, Math.floor(options.maxEvents ?? DEFAULT_CONTEXT_HYGIENE_MAX_EVENTS));
  }

  record(metadata: ContextHygieneMetadata, options: ContextHygieneRecordOptions = {}): ContextHygieneEvent {
    const event: ContextHygieneEvent = {
      id: this.nextEventId++,
      tool: metadata.tool,
      classification: metadata.classification,
      resources: metadata.resources.map((resource) => ({ ...resource } as ContextHygieneResource)),
    };
    if (options.resultId) event.resultId = options.resultId;
    if (metadata.rehydrate) event.rehydrate = cloneContextHygieneRehydrateDescriptor(metadata.rehydrate);
    if (metadata.commandState) event.commandState = cloneBashCommandState(metadata.commandState);
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
    return cloneContextHygieneEvent(event);
  }

  generateReport(): ContextHygieneReport {
    const eventsByResource = new Map<string, ContextHygieneEvent[]>();
    const readEventsByResource = new Map<string, ContextHygieneEvent[]>();
    const commandEventsByResource = new Map<string, ContextHygieneEvent[]>();
    const mutationEventsByResource = new Map<string, ContextHygieneEvent[]>();
    const byClassification = createEmptyClassificationCounts();
    const byTool: Record<string, number> = {};

    for (const event of this.events) {
      byClassification[event.classification] += 1;
      byTool[event.tool] = (byTool[event.tool] ?? 0) + 1;

      for (const resource of event.resources) {
        const bucket = eventsByResource.get(resource.key) ?? [];
        bucket.push(event);
        eventsByResource.set(resource.key, bucket);

        if (event.classification === "read-context" || event.classification === "search-context") {
          const readBucket = readEventsByResource.get(resource.key) ?? [];
          readBucket.push(event);
          readEventsByResource.set(resource.key, readBucket);
        }
        if (event.classification === "command-output" && resource.kind === "command") {
          const commandBucket = commandEventsByResource.get(resource.key) ?? [];
          commandBucket.push(event);
          commandEventsByResource.set(resource.key, commandBucket);
        }
        if (event.classification === "mutation") {
          const mutationBucket = mutationEventsByResource.get(resource.key) ?? [];
          mutationBucket.push(event);
          mutationEventsByResource.set(resource.key, mutationBucket);
        }
      }
    }

    const readReuse = sortResourceKeys(readEventsByResource.keys()).flatMap((resourceKey) => {
      const events = readEventsByResource.get(resourceKey) ?? [];
      if (events.length < 2) return [];
      return [{ resourceKey, count: events.length, eventIds: events.map((event) => event.id), resultIds: resultIdsForEvents(events) }];
    });

    const commandReruns = sortResourceKeys(commandEventsByResource.keys()).flatMap((resourceKey) => {
      const events = commandEventsByResource.get(resourceKey) ?? [];
      if (events.length < 2) return [];
      return [{ resourceKey, count: events.length, eventIds: events.map((event) => event.id), resultIds: resultIdsForEvents(events) }];
    });

    const mutationAfterRead: ContextHygieneMutationAfterReadReportEntry[] = [];
    const staleCandidates: ContextHygieneStaleCandidateReportEntry[] = [];
    const retirementCandidates: ContextHygieneRetirementCandidateReportEntry[] = [];

    for (const resourceKey of sortResourceKeys(mutationEventsByResource.keys())) {
      const reads = readEventsByResource.get(resourceKey) ?? [];
      const mutations = mutationEventsByResource.get(resourceKey) ?? [];
      for (const mutation of mutations) {
        const priorReads = reads.filter((read) => read.id < mutation.id);
        const priorReadIds = priorReads.map((read) => read.id);
        if (priorReadIds.length === 0) continue;
        mutationAfterRead.push({ resourceKey, readEventIds: priorReadIds, mutationEventId: mutation.id });
        staleCandidates.push({
          resourceKey,
          staleEventIds: priorReadIds,
          mutationEventId: mutation.id,
          reason: "mutation-after-read",
          staleResults: priorReads.map((read) => buildStaleContextRecord({
            originalTool: read.tool,
            originalEventId: read.id,
            originalResultId: read.resultId,
            staleResourceKeys: [resourceKey],
            invalidatingMutationEventId: mutation.id,
            invalidatingMutationResultId: mutation.resultId,
            reason: "mutation-after-read",
            rehydrate: read.rehydrate,
          })),
        });
      }
    }

    const bashCommandEvents = this.events.filter(
      (event) => event.tool === "bash" && event.classification === "command-output" && event.commandState,
    );
    const invalidatingRepoEvents = this.events.filter(
      (event) => event.classification === "mutation" || event.commandState?.stateKind === "git-worktree-mutation",
    );
    const commandKeyForEvent = (event: ContextHygieneEvent): string | undefined =>
      event.resources.find((resource) => resource.kind === "command")?.key;

    for (const event of bashCommandEvents) {
      const state = event.commandState;
      if (!state || (state.stateKind !== "repo-status" && state.stateKind !== "repo-diff")) continue;
      const invalidator = invalidatingRepoEvents.find((candidate) => candidate.id > event.id);
      const commandKey = commandKeyForEvent(event);
      if (!invalidator || !commandKey) continue;
      staleCandidates.push({
        resourceKey: commandKey,
        staleEventIds: [event.id],
        mutationEventId: invalidator.id,
        reason: "bash-repo-state-after-mutation",
        staleResults: [buildStaleContextRecord({
          originalTool: event.tool,
          originalEventId: event.id,
          originalResultId: event.resultId,
          staleResourceKeys: [commandKey],
          invalidatingMutationEventId: invalidator.id,
          invalidatingMutationResultId: invalidator.resultId,
          reason: "bash-repo-state-after-mutation",
          command: state.normalizedCommand,
        })],
      });
    }

    for (const event of bashCommandEvents) {
      const state = event.commandState;
      const commandKey = commandKeyForEvent(event);
      if (!state || state.stateKind !== "verification" || state.outcome !== "failure" || !commandKey) continue;
      const success = bashCommandEvents.find((candidate) => {
        const candidateState = candidate.commandState;
        return candidate.id > event.id && commandKeyForEvent(candidate) === commandKey && candidateState?.outcome === "success";
      });
      if (!success) continue;
      staleCandidates.push({
        resourceKey: commandKey,
        staleEventIds: [event.id],
        mutationEventId: success.id,
        reason: "bash-verification-success-rerun",
        staleResults: [buildStaleContextRecord({
          originalTool: event.tool,
          originalEventId: event.id,
          originalResultId: event.resultId,
          staleResourceKeys: [commandKey],
          invalidatingMutationEventId: success.id,
          invalidatingMutationResultId: success.resultId,
          reason: "bash-verification-success-rerun",
          command: state.normalizedCommand,
        })],
      });
    }

    for (const resourceKey of sortResourceKeys(commandEventsByResource.keys())) {
      const eligible = (commandEventsByResource.get(resourceKey) ?? []).filter((event) =>
        event.commandState?.routineRetirementEligible === true && event.commandState.outcome === "success",
      );
      if (eligible.length < 2) continue;
      const latest = eligible[eligible.length - 1];
      const retired = eligible.slice(0, -1);
      retirementCandidates.push({
        resourceKey,
        eventIds: retired.map((event) => event.id),
        supersededByEventId: latest.id,
        reason: "same-command-success-rerun",
        retiredResults: retired.map((event) => buildRetiredContextRecord({
          originalTool: event.tool,
          originalEventId: event.id,
          originalResultId: event.resultId,
          retiredResourceKeys: [resourceKey],
          supersededByEventId: latest.id,
          supersededByResultId: latest.resultId,
          reason: "same-command-success-rerun",
          command: event.commandState?.normalizedCommand,
        })),
      });
    }

    for (const resourceKey of sortResourceKeys(commandEventsByResource.keys())) {
      const commands = (commandEventsByResource.get(resourceKey) ?? []).filter(
        (event) => !(event.tool === "bash" && event.commandState),
      );
      if (commands.length < 2) continue;
      for (let index = 1; index < commands.length; index += 1) {
        retirementCandidates.push({
          resourceKey,
          eventIds: commands.slice(0, index).map((event) => event.id),
          supersededByEventId: commands[index].id,
          reason: "command-rerun",
        });
      }
    }

    return {
      eventCount: this.events.length,
      resourceCount: eventsByResource.size,
      readReuse,
      commandReruns,
      mutationAfterRead,
      staleCandidates,
      retirementCandidates,
      churn: {
        byClassification,
        byTool: Object.fromEntries(Object.entries(byTool).sort(([left], [right]) => compareStable(left, right))),
        uniqueResourcesSeen: eventsByResource.size,
      },
    };
  }
}

export function createContextHygieneTracker(options: CreateContextHygieneTrackerOptions = {}): ContextHygieneTracker {
  return new DefaultContextHygieneTracker(options);
}

let globalContextHygieneTracker = createContextHygieneTracker();

export function resetContextHygieneTracker(options: CreateContextHygieneTrackerOptions = {}): ContextHygieneTracker {
  globalContextHygieneTracker = createContextHygieneTracker(options);
  return globalContextHygieneTracker;
}

export function getContextHygieneTracker(): ContextHygieneTracker {
  return globalContextHygieneTracker;
}
