import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

export type BashOriginalOutputSource = "pi-full-output-path" | "pi-visible-fallback" | "pi-visible";

export interface BashOriginalOutputMetadata {
  enabled: boolean;
  source: BashOriginalOutputSource;
  restoredContentForRtk: boolean;
  originalPath?: string;
  snapshotNeeded: boolean;
  snapshotWritten: boolean;
  snapshotPath?: string;
  originalLineCount: number;
  originalByteCount: number;
  visibleLineCount: number;
  visibleByteCount: number;
  fullOutputReadError?: string;
  snapshotWriteError?: string;
}

export interface BashOriginalOutputFs {
  readFile(path: string): string;
  writeFile(path: string, content: string, options: { mode: number; flag: string }): void;
  randomId(): string;
  tempDir(): string;
}

export interface SelectBashOriginalOutputOptions {
  visibleText: string;
  fullOutputPath?: unknown;
  snapshotMaxLines?: number;
  snapshotMaxBytes?: number;
  /** Hand Pi's full-output file to RTK in place of the visible text; false still names it. */
  restore?: boolean;
  fs?: Partial<BashOriginalOutputFs>;
}

export interface BashOriginalOutputSelection {
  inputForRtk: string;
  metadata?: BashOriginalOutputMetadata;
}

const DEFAULT_SNAPSHOT_MAX_LINES = 2000;
const DEFAULT_SNAPSHOT_MAX_BYTES = 50 * 1024;


function defaultFs(): BashOriginalOutputFs {
  return {
    readFile: (path) => readFileSync(path, "utf8"),
    writeFile: (path, content, options) => writeFileSync(path, content, options),
    randomId: () => randomUUID(),
    tempDir: () => tmpdir(),
  };
}

function mergeFs(overrides: Partial<BashOriginalOutputFs> | undefined): BashOriginalOutputFs {
  return { ...defaultFs(), ...(overrides ?? {}) };
}

function lineCount(text: string): number {
  return text === "" ? 0 : text.split("\n").length;
}

function byteCount(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

export function extractVisibleFullOutputPath(visibleText: string): string | undefined {
  const match = visibleText.match(/Full output:\s*([^\]\r\n]+)/);
  return match?.[1]?.trim() || undefined;
}

function isPathInside(parent: string, candidate: string): boolean {
  const relativePath = relative(parent, candidate);
  return relativePath === "" || (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath));
}

function validateFullOutputPath(fs: BashOriginalOutputFs, value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.trim() !== value || value === "") return undefined;
  if (!isAbsolute(value)) return undefined;
  return isPathInside(fs.tempDir(), value) ? value : undefined;
}

function writeSnapshot(fs: BashOriginalOutputFs, visibleText: string): string {
  const path = join(fs.tempDir(), `hashline-bash-original-${fs.randomId()}.txt`);
  fs.writeFile(path, visibleText, { mode: 0o600, flag: "wx" });
  return path;
}

export function selectBashOriginalOutput(options: SelectBashOriginalOutputOptions): BashOriginalOutputSelection {
  const restore = options.restore !== false;
  const visibleText = options.visibleText;
  const fs = mergeFs(options.fs);
  const visibleLineCount = lineCount(visibleText);
  const visibleByteCount = byteCount(visibleText);
  const metadataPath = validateFullOutputPath(fs, options.fullOutputPath);
  const visibleNoticePath = validateFullOutputPath(fs, extractVisibleFullOutputPath(visibleText));
  const fullOutputPath = metadataPath ?? visibleNoticePath;

  let fallbackSource: BashOriginalOutputSource = "pi-visible";
  let fullOutputReadError: string | undefined;
  if (fullOutputPath) {
    try {
      const fullText = fs.readFile(fullOutputPath);
      return {
        inputForRtk: restore ? fullText : visibleText,
        metadata: {
          enabled: true,
          source: "pi-full-output-path",
          restoredContentForRtk: restore,
          originalPath: fullOutputPath,
          snapshotNeeded: false,
          snapshotWritten: false,
          originalLineCount: lineCount(fullText),
          originalByteCount: byteCount(fullText),
          visibleLineCount,
          visibleByteCount,
        },
      };
    } catch (error) {
      fallbackSource = "pi-visible-fallback";
      fullOutputReadError = error instanceof Error ? error.message : String(error);
    }
  }

  if (!restore || visibleText === "") return { inputForRtk: visibleText };

  const snapshotMaxLines = options.snapshotMaxLines ?? DEFAULT_SNAPSHOT_MAX_LINES;
  const snapshotMaxBytes = options.snapshotMaxBytes ?? DEFAULT_SNAPSHOT_MAX_BYTES;
  const snapshotNeeded = visibleLineCount > snapshotMaxLines || visibleByteCount > snapshotMaxBytes;
  let snapshotPath: string | undefined;
  let snapshotWritten = false;
  let snapshotWriteError: string | undefined;
  if (snapshotNeeded) {
    try {
      snapshotPath = writeSnapshot(fs, visibleText);
      snapshotWritten = true;
    } catch (error) {
      snapshotWriteError = error instanceof Error ? error.message : String(error);
      snapshotPath = undefined;
    }
  }

  const metadata: BashOriginalOutputMetadata = {
    enabled: true,
    source: fallbackSource,
    restoredContentForRtk: false,
    snapshotNeeded,
    snapshotWritten,
    snapshotPath,
    originalPath: snapshotPath,
    originalLineCount: visibleLineCount,
    originalByteCount: visibleByteCount,
    visibleLineCount,
    visibleByteCount,
    fullOutputReadError,
    snapshotWriteError,
  };

  return { inputForRtk: visibleText, metadata };
}

export interface EnsureBashOriginalOutputSnapshotOptions {
  visibleText: string;
  metadata?: BashOriginalOutputMetadata;
  enabled?: boolean;
  fs?: Partial<BashOriginalOutputFs>;
}

export function ensureBashOriginalOutputSnapshot(
  options: EnsureBashOriginalOutputSnapshotOptions,
): BashOriginalOutputMetadata | undefined {
  const enabled = options.enabled !== false;
  const visibleText = options.visibleText;
  const existing = options.metadata;
  if (!enabled || visibleText === "") return existing;
  if (existing?.restoredContentForRtk || existing?.originalPath) return existing;

  const visibleLineCount = existing?.visibleLineCount ?? lineCount(visibleText);
  const visibleByteCount = existing?.visibleByteCount ?? byteCount(visibleText);
  const originalLineCount = existing?.originalLineCount ?? visibleLineCount;
  const originalByteCount = existing?.originalByteCount ?? visibleByteCount;
  const base: BashOriginalOutputMetadata = {
    enabled: true,
    source: existing?.source ?? "pi-visible",
    restoredContentForRtk: false,
    snapshotNeeded: true,
    snapshotWritten: false,
    snapshotPath: undefined,
    originalPath: undefined,
    originalLineCount,
    originalByteCount,
    visibleLineCount,
    visibleByteCount,
    fullOutputReadError: existing?.fullOutputReadError,
    snapshotWriteError: existing?.snapshotWriteError,
  };

  try {
    const snapshotPath = writeSnapshot(mergeFs(options.fs), visibleText);
    return {
      ...base,
      snapshotWritten: true,
      snapshotPath,
      originalPath: snapshotPath,
      snapshotWriteError: existing?.snapshotWriteError,
    };
  } catch (error) {
    return {
      ...base,
      snapshotWriteError: error instanceof Error ? error.message : String(error),
    };
  }
}
