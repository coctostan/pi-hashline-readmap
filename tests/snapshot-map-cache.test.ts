import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from "vitest";
import { clearMapCache, getOrGenerateMap, setMapCacheMaxSize } from "../src/map-cache.js";
import * as mapper from "../src/readmap/mapper.js";
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
  root = mkdtempSync(join(tmpdir(), "snapshot-memory-"));
  path = join(root, "source.ts");
  writeFileSync(path, b);
  __setHashlineSettingsPathsForTest({
    globalSettingsPath: join(root, "missing-global.json"),
    projectSettingsPath: join(root, "missing-project.json"),
  });
  process.env.PI_HASHLINE_NO_PERSIST_MAPS = "1";
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

it("reuses an identical captured map in memory", async () => {
  const first = await getSnapshot(path, a);
  const second = await getSnapshot(path, a);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(second).toBe(first);
  expect(first?.path).toBe(path);
  expect(first?.symbols.some(symbol => symbol.name === "before")).toBe(true);
  expect(generate.mock.calls[0][0]).not.toBe(path);
});

it("invalidates memory on byte changes", async () => {
  await getSnapshot(path, a);
  const changed = await getSnapshot(path, b);
  expect(changed?.symbols.some(symbol => symbol.name === "afterx")).toBe(true);
  expect(generate).toHaveBeenCalledTimes(2);
});

it("invalidates memory on mapper-version changes", async () => {
  await getSnapshot(path, a);
  mapper.ALL_MAPPER_IDENTITIES.typescript = { ...originalIdentity, mapperVersion: originalIdentity.mapperVersion + 1 };
  await getSnapshot(path, a);
  expect(generate).toHaveBeenCalledTimes(2);
});

it("does not reuse a legacy path entry", async () => {
  const legacy = await getOrGenerateMap(path);
  expect(legacy?.symbols.some(symbol => symbol.name === "afterx")).toBe(true);
  generate.mockClear();
  const captured = await getSnapshot(path, a);
  expect(captured?.symbols.some(symbol => symbol.name === "before")).toBe(true);
  expect(generate).toHaveBeenCalledTimes(1);
});

it("allows null negative memory hits", async () => {
  generate.mockResolvedValue({ map: null, ...mapper.ALL_MAPPER_IDENTITIES.fallback });
  expect(await getSnapshot(path, a)).toBeNull();
  expect(await getSnapshot(path, a)).toBeNull();
  expect(generate).toHaveBeenCalledTimes(1);
});

it("does not retain a generated empty non-null map", async () => {
  const valid = await mapper.generateMapWithIdentity(path);
  expect(valid.map?.symbols.length).toBeGreaterThan(0);
  generate.mockClear();
  generate.mockResolvedValueOnce({ ...valid, map: { ...valid.map!, symbols: [] } });
  expect((await getSnapshot(path, b))?.symbols).toEqual([]);
  const recovered = await getSnapshot(path, b);
  expect(recovered?.symbols.some(symbol => symbol.name === "afterx")).toBe(true);
  expect(await getSnapshot(path, b)).toBe(recovered);
  expect(generate).toHaveBeenCalledTimes(2);
});

it("rejects an empty non-null memory entry rather than treating it as null", async () => {
  const first = await getSnapshot(path, a);
  expect(first?.symbols.length).toBeGreaterThan(0);
  first!.symbols = [];
  const recovered = await getSnapshot(path, a);
  expect(recovered?.symbols.some(symbol => symbol.name === "before")).toBe(true);
  expect(generate).toHaveBeenCalledTimes(2);
});

it("bypasses memory for GDScript across enablement changes", async () => {
  const gdPath = join(root, "source.gd");
  const gd = Buffer.from("func target():\n    pass\n");
  await getSnapshot(gdPath, gd);
  await getSnapshot(gdPath, gd);
  process.env.PI_HASHLINE_GDSCRIPT = "1";
  await getSnapshot(gdPath, gd);
  expect(generate).toHaveBeenCalledTimes(3);
});

it("uses the existing bounded LRU for snapshot entries", async () => {
  setMapCacheMaxSize(1);
  await getSnapshot(join(root, "one.ts"), a);
  await getSnapshot(join(root, "two.ts"), a);
  await getSnapshot(join(root, "one.ts"), a);
  expect(generate).toHaveBeenCalledTimes(3);
});
