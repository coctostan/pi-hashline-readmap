import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type TSchema } from "typebox";

/**
 * Pi codemode integration (Pi >= 0.99, tuned for 1.0).
 *
 * Codemode scripts call tools through `ctx.executeTool()`. A tool that declares `outputSchema`
 * resolves to its `structuredContent` inside scripts; any other tool resolves to its text. Hashline
 * tools already build machine-readable `details.ptcValue`, so this module exposes that value to
 * scripts as `structuredContent` (plus the exact model-facing `text`), declares matching output
 * schemas so codemode can describe what each call resolves to, and adds MCP-style `annotations`
 * so permission extensions can tell read-only tools from mutating ones.
 *
 * Error results are left without `structuredContent`, so script calls keep rejecting with the
 * tool's error text, matching codemode's default contract for failed calls.
 */

/** MCP-style tool hints understood by Pi >= 0.99 (`ToolDefinition.annotations`). */
export interface HashlineToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

const READ_ONLY_LOCAL: HashlineToolAnnotations = { readOnlyHint: true, openWorldHint: false };

/**
 * Tools omitted here (`bash`, `nu`) keep Pi's conservative defaults: not read-only, possibly
 * destructive, open world. Both run arbitrary commands, so claiming read-only would let a
 * permission extension auto-approve writes or network access.
 */
export const HASHLINE_TOOL_ANNOTATIONS: Readonly<Record<string, HashlineToolAnnotations>> = {
  read: READ_ONLY_LOCAL,
  grep: READ_ONLY_LOCAL,
  ast_search: READ_ONLY_LOCAL,
  ls: READ_ONLY_LOCAL,
  find: READ_ONLY_LOCAL,
  context_hygiene_report: READ_ONLY_LOCAL,
  edit: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  write: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
};

const TEXT = Type.String({ description: "Exact model-facing text output" });
const LINE = Type.Object({
  line: Type.Number(),
  anchor: Type.String({ description: "LINE:HASH for edit" }),
  raw: Type.String(),
});
const WARNING = Type.Object({ code: Type.String(), message: Type.String() });
const RANGE = Type.Object({ startLine: Type.Number(), endLine: Type.Number() });

/**
 * Compact output schemas. Codemode lists top-level field names in tool descriptions, so keep
 * them short; results may carry additional `ptcValue` fields (see docs/structured-output.md).
 */
export const HASHLINE_TOOL_OUTPUT_SCHEMAS: Readonly<Record<string, TSchema>> = {
  read: Type.Object({
    text: TEXT,
    path: Type.String(),
    range: Type.Object({ startLine: Type.Number(), endLine: Type.Number(), totalLines: Type.Number() }),
    lines: Type.Array(LINE),
    continuation: Type.Union([Type.Object({ nextOffset: Type.Number() }), Type.Null()]),
    warnings: Type.Array(WARNING),
  }),
  grep: Type.Object({
    text: TEXT,
    totalMatches: Type.Number(),
    records: Type.Array(
      Type.Object({
        path: Type.String(),
        line: Type.Number(),
        anchor: Type.String(),
        raw: Type.String(),
        kind: Type.Union([Type.Literal("match"), Type.Literal("context")]),
      }),
    ),
  }),
  ast_search: Type.Object({
    text: TEXT,
    files: Type.Array(Type.Object({ path: Type.String(), ranges: Type.Array(RANGE), lines: Type.Array(LINE) })),
  }),
  edit: Type.Object({
    text: TEXT,
    ok: Type.Boolean(),
    path: Type.String(),
    diff: Type.String(),
    firstChangedLine: Type.Optional(Type.Number()),
    warnings: Type.Array(Type.String()),
  }),
  write: Type.Object({
    text: TEXT,
    path: Type.String(),
    lines: Type.Array(LINE),
    warnings: Type.Array(WARNING),
  }),
  ls: Type.Object({
    text: TEXT,
    path: Type.String(),
    entries: Type.Array(Type.Object({ name: Type.String(), type: Type.Union([Type.Literal("file"), Type.Literal("dir")]) })),
    truncated: Type.Boolean(),
  }),
  find: Type.Object({
    text: TEXT,
    entries: Type.Array(Type.Object({ path: Type.String(), type: Type.Union([Type.Literal("file"), Type.Literal("dir")]) })),
    truncated: Type.Boolean(),
  }),
};

/** True when another tool (for example a codemode script) issued this call. */
export function isNestedToolEvent(event: unknown): boolean {
  if (!event || typeof event !== "object") return false;
  const parent = (event as { parentToolCallId?: unknown }).parentToolCallId;
  return typeof parent === "string" && parent.length > 0;
}

function joinText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((item): item is { type: "text"; text: string } => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

function toJsonValue(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

/**
 * JSON-safe copy for a tool's own `structuredContent`. Typed loosely so it satisfies both older
 * hosts (no `structuredContent` field) and Pi >= 0.99's `JsonValue`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toScriptJson(value: unknown): any {
  return toJsonValue(value);
}

/**
 * The script-facing value for a successful result: `{ text, ...structured }`, JSON-safe, where
 * `structured` is the tool's own `structuredContent` object if it set one, else `details.ptcValue`.
 * Returns `undefined` for error results so codemode rejects with the error text.
 */
export function buildStructuredContent(result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== "object") return undefined;
  const { isError, content, details, structuredContent } = result as {
    isError?: unknown;
    content?: unknown;
    details?: unknown;
    structuredContent?: unknown;
  };
  if (isError === true) return undefined;
  const text = joinText(content);
  const source = structuredContent !== undefined
    ? structuredContent
    : details && typeof details === "object"
      ? (details as { ptcValue?: unknown }).ptcValue
      : undefined;
  const structured = source && typeof source === "object" && !Array.isArray(source)
    ? toJsonValue(source)
    : undefined;
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) return { text };
  return Object.assign({ text }, structured as Record<string, unknown>, { text });
}

type AnyDefinition = Parameters<ExtensionAPI["registerTool"]>[0] & {
  annotations?: HashlineToolAnnotations;
  outputSchema?: TSchema;
};

/**
 * Adds annotations, output schemas, and `structuredContent` to Hashline tool registrations.
 * Definitions are updated in place so executors exported for other integrations behave the same.
 */
export function applyCodemodeIntegration<T extends AnyDefinition>(definition: T): T {
  const name = definition.name;
  const annotations = HASHLINE_TOOL_ANNOTATIONS[name];
  if (annotations && definition.annotations === undefined) definition.annotations = { ...annotations };

  const outputSchema = HASHLINE_TOOL_OUTPUT_SCHEMAS[name];
  if (!outputSchema || definition.outputSchema !== undefined) return definition;
  definition.outputSchema = outputSchema;

  const originalExecute = definition.execute;
  const execute = async function (this: unknown, ...args: Parameters<typeof originalExecute>) {
    const result = await originalExecute.apply(this === undefined ? definition : this, args);
    if (!result || typeof result !== "object") return result;
    const structuredContent = buildStructuredContent(result);
    if (structuredContent !== undefined) return { ...result, structuredContent };
    // Error results: drop any structuredContent so codemode rejects with the error text.
    if ((result as { structuredContent?: unknown }).structuredContent === undefined) return result;
    const { structuredContent: _dropped, ...rest } = result as typeof result & { structuredContent?: unknown };
    return rest as typeof result;
  };
  Object.defineProperty(definition, "execute", { configurable: true, enumerable: true, writable: true, value: execute });
  return definition;
}

export function withCodemodeIntegration(pi: ExtensionAPI): ExtensionAPI {
  const registerTool: ExtensionAPI["registerTool"] = (definition) => {
    pi.registerTool(applyCodemodeIntegration(definition as AnyDefinition) as typeof definition);
  };
  return new Proxy(pi, {
    get(target, property, receiver) {
      return property === "registerTool" ? registerTool : Reflect.get(target, property, receiver);
    },
  });
}
