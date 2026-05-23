import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface HashlineJsonSettings {
  grep?: { maxLines?: number; maxBytes?: number };
  mapCache?: { dir?: string; enabled?: boolean };
  bashContextGuard?: { enabled?: boolean; maxLines?: number; maxBytes?: number; headLines?: number; tailLines?: number };
  gdscript?: { enabled?: boolean };
  edit?: { diffDisplay?: "collapsed" | "expanded" };
}
export interface HashlineSettingsWarning { source: string; message: string; path?: string }
export interface HashlineSettingsResult { settings: HashlineJsonSettings; warnings: HashlineSettingsWarning[] }
let pathOverride: { globalSettingsPath?: string; projectSettingsPath?: string } | null = null;
export function __setHashlineSettingsPathsForTest(paths: { globalSettingsPath?: string; projectSettingsPath?: string }): void { pathOverride = { ...paths }; }
export function __resetHashlineSettingsPathsForTest(): void { pathOverride = null; }
function defaultGlobalSettingsPath(): string { return join(homedir(), ".pi/agent/hashline-readmap/settings.json"); }
function defaultProjectSettingsPath(): string { return join(process.cwd(), ".pi/hashline-readmap/settings.json"); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function invalid(source: string, path: string): HashlineSettingsWarning { return { source, path, message: `Invalid hashline setting at ${path}` }; }
function readJsonObjectEnd(text: string, open: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}
function readJsonStringEnd(text: string, quote: number): number {
  let escaped = false;
  for (let i = quote + 1; i < text.length; i += 1) {
    const char = text[i];
    if (escaped) escaped = false;
    else if (char === "\\") escaped = true;
    else if (char === '"') return i;
  }
  return -1;
}
function readTopLevelObjectBodies(rawText: string, section: string): string[] {
  const bodies: string[] = [];
  let depth = 0;
  for (let i = 0; i < rawText.length; i += 1) {
    const char = rawText[i];
    if (char === '"') {
      const end = readJsonStringEnd(rawText, i);
      if (end < 0) return bodies;
      if (depth === 1) {
        const fieldName = rawText.slice(i + 1, end);
        let cursor = end + 1;
        while (/\s/.test(rawText[cursor] ?? "")) cursor += 1;
        if (rawText[cursor] === ":") {
          cursor += 1;
          while (/\s/.test(rawText[cursor] ?? "")) cursor += 1;
          if (fieldName === section && rawText[cursor] === "{") {
            const objectEnd = readJsonObjectEnd(rawText, cursor);
            if (objectEnd < 0) return bodies;
            bodies.push(rawText.slice(cursor + 1, objectEnd));
            i = objectEnd;
            continue;
          }
        }
      }
      i = end;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
    }
  }
  return bodies;
}
function rawFieldTokens(rawText: string, path: string): string[] {
  const [section, key] = path.split(".");
  const bodies = readTopLevelObjectBodies(rawText, section);
  if (bodies.length !== 1) return [];
  const body = bodies[0];
  const tokens: string[] = [];
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (char === '"') {
      const end = readJsonStringEnd(body, i);
      if (end < 0) return tokens;
      if (depth === 0) {
        const fieldName = body.slice(i + 1, end);
        let cursor = end + 1;
        while (/\s/.test(body[cursor] ?? "")) cursor += 1;
        if (body[cursor] === ":") {
          cursor += 1;
          while (/\s/.test(body[cursor] ?? "")) cursor += 1;
          if (fieldName === key) {
            const valueStart = cursor;
            while (cursor < body.length && !/[,}\s]/.test(body[cursor])) cursor += 1;
            tokens.push(body.slice(valueStart, cursor));
          }
        }
      }
      i = end;
    } else if (char === "{" || char === "[") {
      depth += 1;
    } else if (char === "}" || char === "]") {
      depth = Math.max(0, depth - 1);
    }
  }
  return tokens;
}
function isStrictJsonPositiveInteger(rawText: string, path: string, value: unknown): value is number {
  const tokens = rawFieldTokens(rawText, path);
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && tokens.length === 1 && /^[1-9][0-9]*$/.test(tokens[0]);
}
function readPositive(raw: Record<string, unknown>, key: string, path: string, source: string, rawText: string, warnings: HashlineSettingsWarning[]): number | undefined {
  if (!(key in raw)) return undefined;
  if (isStrictJsonPositiveInteger(rawText, path, raw[key])) return raw[key];
  warnings.push(invalid(source, path));
  return undefined;
}
function readBoolean(raw: Record<string, unknown>, key: string, path: string, source: string, warnings: HashlineSettingsWarning[]): boolean | undefined {
  if (!(key in raw)) return undefined;
  if (typeof raw[key] === "boolean") return raw[key];
  warnings.push(invalid(source, path));
  return undefined;
}
function validateSettings(raw: unknown, source: string, rawText: string): HashlineSettingsResult {
  const settings: HashlineJsonSettings = {};
  const warnings: HashlineSettingsWarning[] = [];
  if (!isRecord(raw)) return { settings, warnings };
  if (isRecord(raw.grep)) {
    const grep: NonNullable<HashlineJsonSettings["grep"]> = {};
    const maxLines = readPositive(raw.grep, "maxLines", "grep.maxLines", source, rawText, warnings);
    if (maxLines !== undefined) grep.maxLines = maxLines;
    const maxBytes = readPositive(raw.grep, "maxBytes", "grep.maxBytes", source, rawText, warnings);
    if (maxBytes !== undefined) grep.maxBytes = maxBytes;
    if (Object.keys(grep).length > 0) settings.grep = grep;
  }
  if (isRecord(raw.mapCache)) {
    const mapCache: NonNullable<HashlineJsonSettings["mapCache"]> = {};
    if ("dir" in raw.mapCache) {
      if (typeof raw.mapCache.dir === "string" && raw.mapCache.dir.length > 0) mapCache.dir = raw.mapCache.dir;
      else warnings.push(invalid(source, "mapCache.dir"));
    }
    const enabled = readBoolean(raw.mapCache, "enabled", "mapCache.enabled", source, warnings);
    if (enabled !== undefined) mapCache.enabled = enabled;
    if (Object.keys(mapCache).length > 0) settings.mapCache = mapCache;
  }
  if (isRecord(raw.bashContextGuard)) {
    const bashContextGuard: NonNullable<HashlineJsonSettings["bashContextGuard"]> = {};
    const enabled = readBoolean(raw.bashContextGuard, "enabled", "bashContextGuard.enabled", source, warnings);
    if (enabled !== undefined) bashContextGuard.enabled = enabled;
    for (const key of ["maxLines", "maxBytes", "headLines", "tailLines"] as const) {
      const value = readPositive(raw.bashContextGuard, key, `bashContextGuard.${key}`, source, rawText, warnings);
      if (value !== undefined) bashContextGuard[key] = value;
    }
    if (Object.keys(bashContextGuard).length > 0) settings.bashContextGuard = bashContextGuard;
  }
  if (isRecord(raw.gdscript)) {
    const gdscript: NonNullable<HashlineJsonSettings["gdscript"]> = {};
    const enabled = readBoolean(raw.gdscript, "enabled", "gdscript.enabled", source, warnings);
    if (enabled !== undefined) gdscript.enabled = enabled;
    if (Object.keys(gdscript).length > 0) settings.gdscript = gdscript;
  }
  if (isRecord(raw.edit)) {
    const edit: NonNullable<HashlineJsonSettings["edit"]> = {};
    if ("diffDisplay" in raw.edit) {
      const value = raw.edit.diffDisplay;
      // Accept both "collapsed" and "expanded" literals (AC 2 + AC 3); other values warn.
      if (value === "collapsed" || value === "expanded") edit.diffDisplay = value;
      else warnings.push(invalid(source, "edit.diffDisplay"));
    }
    if (Object.keys(edit).length > 0) settings.edit = edit;
  }
  return { settings, warnings };
}
function readSettingsFile(path: string): HashlineSettingsResult {
  if (!existsSync(path)) return { settings: {}, warnings: [] };
  try {
    const text = readFileSync(path, "utf8");
    return validateSettings(JSON.parse(text) as unknown, path, text);
  } catch (error) {
    return { settings: {}, warnings: [{ source: path, message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` }] };
  }
}
function mergeSettings(base: HashlineJsonSettings, override: HashlineJsonSettings): HashlineJsonSettings {
  const merged: HashlineJsonSettings = {};
  const grep = { ...(base.grep ?? {}), ...(override.grep ?? {}) };
  if (Object.keys(grep).length > 0) merged.grep = grep;
  const mapCache = { ...(base.mapCache ?? {}), ...(override.mapCache ?? {}) };
  if (Object.keys(mapCache).length > 0) merged.mapCache = mapCache;
  const bashContextGuard = { ...(base.bashContextGuard ?? {}), ...(override.bashContextGuard ?? {}) };
  if (Object.keys(bashContextGuard).length > 0) merged.bashContextGuard = bashContextGuard;
  const gdscript = { ...(base.gdscript ?? {}), ...(override.gdscript ?? {}) };
  if (Object.keys(gdscript).length > 0) merged.gdscript = gdscript;
  const edit = { ...(base.edit ?? {}), ...(override.edit ?? {}) };
  if (Object.keys(edit).length > 0) merged.edit = edit;
  return merged;
}
export function resolveHashlineJsonSettings(): HashlineSettingsResult {
  const globalResult = readSettingsFile(pathOverride?.globalSettingsPath ?? defaultGlobalSettingsPath());
  const projectResult = readSettingsFile(pathOverride?.projectSettingsPath ?? defaultProjectSettingsPath());
  return { settings: mergeSettings(globalResult.settings, projectResult.settings), warnings: [...globalResult.warnings, ...projectResult.warnings] };
}

export function isGdscriptMappingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.PI_HASHLINE_GDSCRIPT !== undefined) {
    return env.PI_HASHLINE_GDSCRIPT === "1";
  }
  return resolveHashlineJsonSettings().settings.gdscript?.enabled === true;
}

export function resolveEditDiffDisplay(env: NodeJS.ProcessEnv = process.env): "collapsed" | "expanded" {
  const raw = env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "expanded" || normalized === "collapsed") return normalized;
  }
  const json = resolveHashlineJsonSettings().settings.edit?.diffDisplay;
  if (json === "expanded" || json === "collapsed") return json;
  return "collapsed";
}
