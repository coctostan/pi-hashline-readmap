import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from "vitest";
import { clearMapCache, getOrGenerateMap } from "../src/map-cache.js";
import * as mapper from "../src/readmap/mapper.js";
import * as persistent from "../src/persistent-map-cache.js";
import { computeKey, readCached, writeCachedRaw } from "../src/persistent-map-cache.js";
import type { FileMap } from "../src/readmap/types.js";
import { __setHashlineSettingsPathsForTest, __resetHashlineSettingsPathsForTest } from "../src/hashline-settings.js";

const a = Buffer.from("export function before() { return 1; }\n");
const b = Buffer.from("export function afterx() { return 2; }\n");
const originalIdentity = mapper.ALL_MAPPER_IDENTITIES.typescript;
const envKeys = ["PI_HASHLINE_NO_PERSIST_MAPS", "PI_HASHLINE_MAP_CACHE_DIR", "PI_HASHLINE_GDSCRIPT"] as const;
let saved: (string | undefined)[];
let root: string;
let path: string;
let generate: MockInstance<typeof mapper.generateMapWithIdentity>;
const getSnapshot = (file: string, bytes: Buffer): Promise<FileMap | null> =>
  Reflect.apply(getOrGenerateMap, undefined, [file, bytes]);

beforeEach(() => {
  saved = envKeys.map(key => process.env[key]);
  root = mkdtempSync(join(tmpdir(), "snapshot-disk-"));
  path = join(root, "source.ts");
  writeFileSync(path, a);
  const projectSettingsPath = join(root, "settings.json");
  writeFileSync(projectSettingsPath, JSON.stringify({ mapCache: { enabled: true } }));
  __setHashlineSettingsPathsForTest({
    globalSettingsPath: join(root, "missing-global.json"),
    projectSettingsPath,
  });
  process.env.PI_HASHLINE_NO_PERSIST_MAPS = "0";
  process.env.PI_HASHLINE_MAP_CACHE_DIR = join(root, "cache");
  process.env.PI_HASHLINE_GDSCRIPT = "0";
  clearMapCache();
  generate = vi.spyOn(mapper, "generateMapWithIdentity");
});
afterEach(() => {
  mapper.ALL_MAPPER_IDENTITIES.typescript = originalIdentity;
  vi.restoreAllMocks();
  clearMapCache();
  __resetHashlineSettingsPathsForTest();
  envKeys.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key];
    else process.env[key] = saved[i];
  });
  rmSync(root, { recursive: true, force: true });
});

it("reuses a captured map from disk after clearing memory", async () => {
  const first = await getSnapshot(path, a);
  clearMapCache();
  const second = await getSnapshot(path, a);
  expect(second).toEqual(first);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(second?.symbols.some(symbol => symbol.name === "before")).toBe(true);
});

it("does not reuse a disk entry for changed bytes", async () => {
  await getSnapshot(path, a);
  clearMapCache();
  generate.mockClear();
  const changed = await getSnapshot(path, b);
  expect(changed?.symbols.some(symbol => symbol.name === "afterx")).toBe(true);
  expect(generate).toHaveBeenCalledTimes(1);
});

it("does not reuse a disk entry for a changed mapper version", async () => {
  await getSnapshot(path, a);
  clearMapCache();
  generate.mockClear();
  mapper.ALL_MAPPER_IDENTITIES.typescript = { ...originalIdentity, mapperVersion: originalIdentity.mapperVersion + 1 };
  await getSnapshot(path, a);
  expect(generate).toHaveBeenCalledTimes(1);
});

it("rejects an empty non-null map seeded under a snapshot-only key", async () => {
  const valid = await mapper.generateMapWithIdentity(path);
  expect(valid.map?.symbols.some(symbol => symbol.name === "before")).toBe(true);
  const validMap = valid.map!;
  generate.mockClear();
  const digest = "snapshot-v1:" + createHash("sha256").update(a).digest("hex");
  const identity = mapper.ALL_MAPPER_IDENTITIES.typescript;
  const key = computeKey(path, 0, digest, identity.mapperName, identity.mapperVersion);
  await writeCachedRaw(key, { ...validMap, path, totalBytes: a.length, symbols: [] });
  expect((await readCached(key))?.symbols).toEqual([]);
  clearMapCache();
  const recovered = await getSnapshot(path, a);
  expect(recovered?.symbols.some(symbol => symbol.name === "before")).toBe(true);
  expect(generate).toHaveBeenCalledTimes(1);
  expect((await readCached(key))?.symbols.some(symbol => symbol.name === "before")).toBe(true);
});

it.each(["path", "size"] as const)("rejects a snapshot disk map with mismatched %s", async field => {
  const valid = await mapper.generateMapWithIdentity(path);
  expect(valid.map?.symbols.length).toBeGreaterThan(0);
  generate.mockClear();
  const digest = "snapshot-v1:" + createHash("sha256").update(a).digest("hex");
  const identity = mapper.ALL_MAPPER_IDENTITIES.typescript;
  const key = computeKey(path, 0, digest, identity.mapperName, identity.mapperVersion);
  const map = { ...valid.map!, path, totalBytes: a.length };
  if (field === "path") map.path = join(root, "wrong.ts");
  else map.totalBytes++;
  await writeCachedRaw(key, map);
  clearMapCache();
  const recovered = await getSnapshot(path, a);
  expect(recovered?.path).toBe(path);
  expect(recovered?.totalBytes).toBe(a.length);
  expect(generate).toHaveBeenCalledTimes(1);
});

it("does not reuse legacy path-map disk entries", async () => {
  writeFileSync(path, b);
  const legacy = await getOrGenerateMap(path);
  expect(legacy?.symbols.some(symbol => symbol.name === "afterx")).toBe(true);
  clearMapCache();
  generate.mockClear();
  const captured = await getSnapshot(path, a);
  expect(captured?.symbols.some(symbol => symbol.name === "before")).toBe(true);
  expect(generate).toHaveBeenCalledTimes(1);
});

it("regenerates after clearing memory when persistence is disabled", async () => {
  process.env.PI_HASHLINE_NO_PERSIST_MAPS = "1";
  const first = await getSnapshot(path, a);
  clearMapCache();
  expect(await getSnapshot(path, a)).toEqual(first);
  expect(generate).toHaveBeenCalledTimes(2);
});

it("does not persist null negative maps", async () => {
  generate.mockResolvedValue({ map: null, ...mapper.ALL_MAPPER_IDENTITIES.fallback });
  expect(await getSnapshot(path, a)).toBeNull();
  clearMapCache();
  expect(await getSnapshot(path, a)).toBeNull();
  expect(generate).toHaveBeenCalledTimes(2);
});

it("bypasses persistent caching for GDScript across enablement changes", async () => {
  const gdPath = join(root, "source.gd");
  const gd = Buffer.from("func target():\n    pass\n");
  await getSnapshot(gdPath, gd);
  clearMapCache();
  await getSnapshot(gdPath, gd);
  clearMapCache();
  process.env.PI_HASHLINE_GDSCRIPT = "1";
  await getSnapshot(gdPath, gd);
  expect(generate).toHaveBeenCalledTimes(3);
});

it.each(["lookup", "write"] as const)("returns a coherent map on thrown cache %s failure", async operation => {
  if (operation === "lookup") vi.spyOn(persistent, "readCached").mockRejectedValue(new Error("injected lookup failure"));
  else vi.spyOn(persistent, "writeCached").mockRejectedValue(new Error("injected write failure"));
  const captured = await getSnapshot(path, a);
  expect(captured?.symbols.some(symbol => symbol.name === "before")).toBe(true);
  expect(generate).toHaveBeenCalledTimes(1);
});

it("returns a coherent map with an unusable cache directory", async () => {
  const blocked = join(root, "not-a-directory");
  writeFileSync(blocked, "blocked");
  process.env.PI_HASHLINE_MAP_CACHE_DIR = blocked;
  const captured = await getSnapshot(path, a);
  expect(captured?.symbols.some(symbol => symbol.name === "before")).toBe(true);
  expect(generate).toHaveBeenCalledTimes(1);
});
