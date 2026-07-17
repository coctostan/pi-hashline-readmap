import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePositiveBase10Int } from "../grep-budget.js";
import { resolveHashlineJsonSettings } from "../hashline-settings.js";
import type { BashOriginalOutputMetadata } from "./bash-original-output.js";

export const BASH_CONTEXT_GUARD_DEFAULT_MAX_LINES = 2000;
export const BASH_CONTEXT_GUARD_DEFAULT_MAX_BYTES = 50 * 1024;
export const BASH_CONTEXT_GUARD_DEFAULT_HEAD_LINES = 80;
export const BASH_CONTEXT_GUARD_DEFAULT_TAIL_LINES = 120;

const BASH_CONTEXT_GUARD_PREVIEW_LINE_MAX_BYTES = 1024;

export interface BashContextGuardConfig {
  enabled: boolean;
  maxLines: number;
  maxBytes: number;
  headLines: number;
  tailLines: number;
}

export interface BashContextGuardMetadata {
  enabled: boolean;
  trimmed: boolean;
  trimWanted: boolean;
  postRtkLineCount: number;
  postRtkByteCount: number;
  maxLines: number;
  maxBytes: number;
  headLines: number;
  tailLines: number;
  postRtkOutputPath?: string;
  postRtkWriteError?: string;
  preservedNoticeCount?: number;
}

export interface BashContextGuardFs {
  writeFile(path: string, content: string, options: { mode: number; flag: string }): void;
  randomId(): string;
  tempDir(): string;
}

export interface ApplyBashContextGuardOptions {
  text: string;
  command?: string;
  originalMetadata?: BashOriginalOutputMetadata;
  config?: BashContextGuardConfig;
  fs?: Partial<BashContextGuardFs>;
}

export interface BashContextGuardResult {
  text: string;
  metadata: BashContextGuardMetadata;
}

type Env = Record<string, string | undefined>;

function defaultFs(): BashContextGuardFs {
  return {
    writeFile: (path, content, options) => writeFileSync(path, content, options),
    randomId: () => randomUUID(),
    tempDir: () => tmpdir(),
  };
}

function mergeFs(overrides: Partial<BashContextGuardFs> | undefined): BashContextGuardFs {
  return { ...defaultFs(), ...(overrides ?? {}) };
}

function resolveEnvDimension(rawEnvValue: string | undefined, ceiling: number): number | undefined {
  const parsed = parsePositiveBase10Int(rawEnvValue);
  return parsed === undefined ? undefined : Math.min(parsed, ceiling);
}

function resolveDimension(rawEnvValue: string | undefined, jsonValue: number | undefined, ceiling: number): number {
  if (rawEnvValue !== undefined) {
    const envValue = resolveEnvDimension(rawEnvValue, ceiling);
    if (envValue !== undefined) return envValue;
  }
  if (jsonValue !== undefined) return Math.min(jsonValue, ceiling);
  return ceiling;
}

function lineCount(text: string): number {
  return text === "" ? 0 : text.split("\n").length;
}

function byteCount(text: string): number {
  return Buffer.byteLength(text, "utf8");
}


function truncateUtf8(text: string, maxBytes: number): { text: string; byteCount: number } {
  let bytes = 0;
  let result = "";

  for (const char of text) {
    const charBytes = byteCount(char);
    if (bytes + charBytes > maxBytes) break;
    result += char;
    bytes += charBytes;
  }

  return { text: result, byteCount: bytes };
}

function formatPreviewLine(line: string): string {
  const totalBytes = byteCount(line);
  if (totalBytes <= BASH_CONTEXT_GUARD_PREVIEW_LINE_MAX_BYTES) return line;

  const truncated = truncateUtf8(line, BASH_CONTEXT_GUARD_PREVIEW_LINE_MAX_BYTES);
  return `${truncated.text}\n[truncated preview line: ${totalBytes} bytes total, showing ${truncated.byteCount} bytes]`;
}

function writeGuardedOutput(fs: BashContextGuardFs, text: string): string {
  const path = join(fs.tempDir(), `hashline-bash-output-${fs.randomId()}.txt`);
  fs.writeFile(path, text, { mode: 0o600, flag: "wx" });
  return path;
}

function compactCommand(command: string | undefined): string | undefined {
  const compact = command?.replace(/\s+/g, " ").trim();
  if (!compact) return undefined;
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
}

function isRawCommandWrapper(line: string): boolean {
  return /^Ran\b/.test(line.trim());
}

function isProtectedNotice(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("[Hint:") ||
    trimmed.includes("Full output:") ||
    /^Full output:\s*\S+/.test(trimmed) ||
    /^Command exited with code \d+/.test(trimmed) ||
    trimmed.startsWith("[Bash context guard:") ||
    trimmed.startsWith("Full Bash output:") ||
    trimmed.startsWith("⚠ REPEATED-CALL WARNING:") ||
    trimmed.startsWith("⚠ ALTERNATING-CALL WARNING:")
  );
}

function splitPreviewLines(text: string): { bodyLines: string[]; preservedNotices: string[] } {
  const bodyLines: string[] = [];
  const preservedNotices: string[] = [];
  const seenNotices = new Set<string>();

  for (const line of text.split("\n")) {
    if (isRawCommandWrapper(line)) continue;
    if (isProtectedNotice(line)) {
      if (!seenNotices.has(line)) {
        seenNotices.add(line);
        preservedNotices.push(line);
      }
      continue;
    }
    bodyLines.push(line);
  }

  return { bodyLines, preservedNotices };
}

function renderPreview(options: {
  text: string;
  outputPath: string;
  command?: string;
  originalMetadata?: BashOriginalOutputMetadata;
  metadata: BashContextGuardMetadata;
  preservedNotices: string[];
}): string {
  const { bodyLines, preservedNotices } = { ...splitPreviewLines(options.text), preservedNotices: options.preservedNotices };
  const headEnd = Math.min(options.metadata.headLines, bodyLines.length);
  const tailStart = options.metadata.tailLines === 0 ? bodyLines.length : Math.max(headEnd, bodyLines.length - options.metadata.tailLines);
  const head = bodyLines.slice(0, headEnd).map(formatPreviewLine);
  const tail = bodyLines.slice(tailStart).map(formatPreviewLine);
  const omitted = bodyLines.slice(headEnd, tailStart);
  const omittedText = omitted.join("\n");
  const command = compactCommand(options.command);
  const rendered: string[] = [
    "[Bash context guard: preview]",
    `Full Bash output: ${options.outputPath}`,
  ];

  if (options.originalMetadata?.originalPath) rendered.push(`Original Bash output: ${options.originalMetadata.originalPath}`);
  if (options.originalMetadata) {
    rendered.push(`Original: ${options.originalMetadata.originalLineCount} lines, ${options.originalMetadata.originalByteCount} bytes`);
  }
  rendered.push(`Guard input: ${options.metadata.postRtkLineCount} lines, ${options.metadata.postRtkByteCount} bytes`);
  rendered.push(`Trigger thresholds: ${options.metadata.maxLines} lines, ${options.metadata.maxBytes} bytes`);
  if (command) rendered.push(`Command: ${command}`);
  if (preservedNotices.length > 0) rendered.push("", "Preserved notices:", ...preservedNotices);
  rendered.push("", "Head:", ...head);
  if (omitted.length > 0) rendered.push(`... omitted ${omitted.length} lines / ${byteCount(omittedText)} bytes ...`);
  rendered.push("Tail:", ...tail, "[End Bash context guard preview]");
  return rendered.join("\n");
}

export function resolveBashContextGuardConfig(env: Env = process.env): BashContextGuardConfig {
  const settings = resolveHashlineJsonSettings().settings.bashContextGuard;
  const enabled = env.PI_HASHLINE_BASH_CONTEXT_GUARD === "0"
    ? false
    : env.PI_HASHLINE_BASH_CONTEXT_GUARD !== undefined
      ? true
      : settings?.enabled ?? true;
  return {
    enabled,
    maxLines: resolveDimension(env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES, settings?.maxLines, BASH_CONTEXT_GUARD_DEFAULT_MAX_LINES),
    maxBytes: resolveDimension(env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES, settings?.maxBytes, BASH_CONTEXT_GUARD_DEFAULT_MAX_BYTES),
    headLines: resolveDimension(env.PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES, settings?.headLines, BASH_CONTEXT_GUARD_DEFAULT_HEAD_LINES),
    tailLines: resolveDimension(env.PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES, settings?.tailLines, BASH_CONTEXT_GUARD_DEFAULT_TAIL_LINES),
  };
}

export function applyBashContextGuard(options: ApplyBashContextGuardOptions): BashContextGuardResult {
  const config = options.config ?? resolveBashContextGuardConfig();
  const postRtkLineCount = lineCount(options.text);
  const postRtkByteCount = byteCount(options.text);
  const trimWanted = config.enabled && options.text !== "" && (postRtkLineCount > config.maxLines || postRtkByteCount > config.maxBytes);
  const preservedNotices = trimWanted ? splitPreviewLines(options.text).preservedNotices : [];
  const baseMetadata: BashContextGuardMetadata = {
    enabled: config.enabled,
    trimmed: false,
    trimWanted,
    postRtkLineCount,
    postRtkByteCount,
    maxLines: config.maxLines,
    maxBytes: config.maxBytes,
    headLines: config.headLines,
    tailLines: config.tailLines,
    preservedNoticeCount: preservedNotices.length,
  };

  if (!trimWanted) return { text: options.text, metadata: baseMetadata };

  try {
    const outputPath = writeGuardedOutput(mergeFs(options.fs), options.text);
    const metadata: BashContextGuardMetadata = {
      ...baseMetadata,
      trimmed: true,
      postRtkOutputPath: outputPath,
    };
    return {
      text: renderPreview({
        text: options.text,
        outputPath,
        command: options.command,
        originalMetadata: options.originalMetadata,
        metadata,
        preservedNotices,
      }),
      metadata,
    };
  } catch (error) {
    return {
      text: options.text,
      metadata: {
        ...baseMetadata,
        postRtkWriteError: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
