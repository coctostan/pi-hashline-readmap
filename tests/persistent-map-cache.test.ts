import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import xxhashWasm from "xxhash-wasm";
import { mkdir, rm, writeFile, unlink, readdir, utimes, stat as fsStat, readFile } from "node:fs/promises";
import { resolveCacheDir, computeKey, contentHashForFile, readCached, writeCachedRaw, writeCached, __setEvictionHooksForTest, __resetWriteCounter } from "../src/persistent-map-cache.js";
import * as persistentMapCacheModule from "../src/persistent-map-cache.js";
import * as mapperModule from "../src/readmap/mapper.js";
import { clearMapCache, getOrGenerateMap } from "../src/map-cache.js";
import { __resetHashlineSettingsPathsForTest, __setHashlineSettingsPathsForTest } from "../src/hashline-settings.js";

const SAVED = {
  dir: process.env.PI_HASHLINE_MAP_CACHE_DIR,
  xdg: process.env.XDG_CACHE_HOME,
  noPersist: process.env.PI_HASHLINE_NO_PERSIST_MAPS,
};

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe("resolveCacheDir", () => {
  beforeEach(() => {
    delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    delete process.env.XDG_CACHE_HOME;
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(tmpdir(), `missing-global-${randomBytes(6).toString("hex")}.json`),
      projectSettingsPath: join(tmpdir(), `missing-project-${randomBytes(6).toString("hex")}.json`),
    });
  });

  afterEach(() => {
    restoreEnv("PI_HASHLINE_MAP_CACHE_DIR", SAVED.dir);
    restoreEnv("XDG_CACHE_HOME", SAVED.xdg);
    restoreEnv("PI_HASHLINE_NO_PERSIST_MAPS", SAVED.noPersist);
    __resetHashlineSettingsPathsForTest();
  });

  it("uses PI_HASHLINE_MAP_CACHE_DIR when set", () => {
    process.env.PI_HASHLINE_MAP_CACHE_DIR = "/tmp/explicit-override";
    expect(resolveCacheDir()).toBe("/tmp/explicit-override");
  });

  it("falls through to XDG_CACHE_HOME when override empty", () => {
    process.env.PI_HASHLINE_MAP_CACHE_DIR = "";
    process.env.XDG_CACHE_HOME = "/tmp/xdg";
    expect(resolveCacheDir()).toBe("/tmp/xdg/pi-hashline-readmap/maps");
  });

  it("falls back to ~/.cache when neither env var set", () => {
    expect(resolveCacheDir()).toBe(join(homedir(), ".cache/pi-hashline-readmap/maps"));
  });
});


describe("resolveCacheDir JSON settings", () => {
  it("uses JSON mapCache.dir when env cache dir is unset", async () => {
    delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    delete process.env.XDG_CACHE_HOME;
    const root = join(tmpdir(), `pmc-json-dir-${randomBytes(6).toString("hex")}`);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ mapCache: { dir: "/tmp/json-map-cache" } }));
    __setHashlineSettingsPathsForTest({ globalSettingsPath: join(root, "missing.json"), projectSettingsPath });
    try {
      expect(resolveCacheDir()).toBe("/tmp/json-map-cache");
    } finally {
      __resetHashlineSettingsPathsForTest();
      await rm(root, { recursive: true, force: true });
      restoreEnv("PI_HASHLINE_MAP_CACHE_DIR", SAVED.dir);
      restoreEnv("XDG_CACHE_HOME", SAVED.xdg);
    }
  });


  it("lets PI_HASHLINE_MAP_CACHE_DIR override JSON mapCache.dir", async () => {
    const root = join(tmpdir(), `pmc-env-dir-${randomBytes(6).toString("hex")}`);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ mapCache: { dir: "/tmp/json-map-cache" } }));
    __setHashlineSettingsPathsForTest({ globalSettingsPath: join(root, "missing.json"), projectSettingsPath });
    process.env.PI_HASHLINE_MAP_CACHE_DIR = "/tmp/env-map-cache";
    try {
      expect(resolveCacheDir()).toBe("/tmp/env-map-cache");
    } finally {
      __resetHashlineSettingsPathsForTest();
      await rm(root, { recursive: true, force: true });
      restoreEnv("PI_HASHLINE_MAP_CACHE_DIR", SAVED.dir);
    }
  });


  it("keeps XDG_CACHE_HOME and home fallbacks when explicit config is unset", () => {
    delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    process.env.XDG_CACHE_HOME = "/tmp/xdg-cache";
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(tmpdir(), `missing-global-${randomBytes(6).toString("hex")}.json`),
      projectSettingsPath: join(tmpdir(), `missing-project-${randomBytes(6).toString("hex")}.json`),
    });
    try {
      expect(resolveCacheDir()).toBe("/tmp/xdg-cache/pi-hashline-readmap/maps");
      delete process.env.XDG_CACHE_HOME;
      expect(resolveCacheDir()).toBe(join(homedir(), ".cache/pi-hashline-readmap/maps"));
    } finally {
      __resetHashlineSettingsPathsForTest();
      restoreEnv("PI_HASHLINE_MAP_CACHE_DIR", SAVED.dir);
      restoreEnv("XDG_CACHE_HOME", SAVED.xdg);
    }
  });

  it("disables persistence when JSON mapCache.enabled is false", async () => {
    delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    const root = join(tmpdir(), `pmc-json-disabled-${randomBytes(6).toString("hex")}`);
    const dir = join(root, "cache");
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ mapCache: { dir, enabled: false } }));
    __setHashlineSettingsPathsForTest({ globalSettingsPath: join(root, "missing.json"), projectSettingsPath });
    const map = { path: "/x", totalLines: 1, totalBytes: 1, language: "typescript", symbols: [], imports: [], detailLevel: "outline" } as any;
    try {
      await writeCachedRaw("json-disabled", map);
      expect(await readCached("json-disabled")).toBeNull();
    } finally {
      __resetHashlineSettingsPathsForTest();
      await rm(root, { recursive: true, force: true });
      restoreEnv("PI_HASHLINE_NO_PERSIST_MAPS", SAVED.noPersist);
    }
  });

  it("bypasses persistent lookup/write in getOrGenerateMap when JSON mapCache.enabled is false", async () => {
    delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    const root = join(tmpdir(), `pmc-json-disabled-map-${randomBytes(6).toString("hex")}`);
    const srcPath = join(root, "src.ts");
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(srcPath, "export const x = 1;\n");
    await writeFile(projectSettingsPath, JSON.stringify({ mapCache: { enabled: false } }));
    __setHashlineSettingsPathsForTest({ globalSettingsPath: join(root, "missing.json"), projectSettingsPath });
    clearMapCache();
    const readSpy = vi.spyOn(persistentMapCacheModule, "readCached");
    const writeSpy = vi.spyOn(persistentMapCacheModule, "writeCached");
    try {
      expect(await getOrGenerateMap(srcPath)).not.toBeNull();
      expect(readSpy).not.toHaveBeenCalled();
      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      clearMapCache();
      __resetHashlineSettingsPathsForTest();
      await rm(root, { recursive: true, force: true });
      restoreEnv("PI_HASHLINE_NO_PERSIST_MAPS", SAVED.noPersist);
    }
  });

  it("lets PI_HASHLINE_NO_PERSIST_MAPS disable persistence over JSON", async () => {
    const root = join(tmpdir(), `pmc-env-disabled-${randomBytes(6).toString("hex")}`);
    const dir = join(root, "cache");
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ mapCache: { dir, enabled: true } }));
    __setHashlineSettingsPathsForTest({ globalSettingsPath: join(root, "missing.json"), projectSettingsPath });
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = "1";
    const map = { path: "/x", totalLines: 1, totalBytes: 1, language: "typescript", symbols: [], imports: [], detailLevel: "outline" } as any;
    try {
      await writeCachedRaw("env-disabled", map);
      expect(await readCached("env-disabled")).toBeNull();
    } finally {
      __resetHashlineSettingsPathsForTest();
      await rm(root, { recursive: true, force: true });
      restoreEnv("PI_HASHLINE_NO_PERSIST_MAPS", SAVED.noPersist);
    }
  });
});


describe("computeKey", () => {
  it("produces identical keys for identical tuples", () => {
    const a = computeKey("/abs/path", 1234, "deadbeef", "typescript", 1);
    const b = computeKey("/abs/path", 1234, "deadbeef", "typescript", 1);
    expect(a).toBe(b);
  });

  it("produces different keys when any component changes", () => {
    const base = computeKey("/abs/path", 1234, "deadbeef", "typescript", 1);
    expect(computeKey("/other", 1234, "deadbeef", "typescript", 1)).not.toBe(base);
    expect(computeKey("/abs/path", 9999, "deadbeef", "typescript", 1)).not.toBe(base);
    expect(computeKey("/abs/path", 1234, "cafef00d", "typescript", 1)).not.toBe(base);
    expect(computeKey("/abs/path", 1234, "deadbeef", "python", 1)).not.toBe(base);
    expect(computeKey("/abs/path", 1234, "deadbeef", "typescript", 2)).not.toBe(base);
  });

  it("returns a lowercase hex string safe for filenames", () => {
    const k = computeKey("/abs", 1, "x", "y", 1);
    expect(k).toMatch(/^[0-9a-f]+$/);
  });
});

describe("contentHashForFile", () => {
  const tmp: string[] = [];

  afterEach(async () => {
    for (const p of tmp.splice(0)) {
      try {
        await unlink(p);
      } catch {}
    }
  });

  function mk(): string {
    const p = join(tmpdir(), `chash-${randomBytes(6).toString("hex")}`);
    tmp.push(p);
    return p;
  }

  it("returns same hash for identical content", async () => {
    const p1 = mk();
    const p2 = mk();
    await writeFile(p1, "hello world");
    await writeFile(p2, "hello world");
    expect(await contentHashForFile(p1)).toBe(await contentHashForFile(p2));
  });

  it("differs when content differs", async () => {
    const p1 = mk();
    const p2 = mk();
    await writeFile(p1, "hello world");
    await writeFile(p2, "HELLO world");
    expect(await contentHashForFile(p1)).not.toBe(await contentHashForFile(p2));
  });

  it("covers equal-length tail changes with bounded streaming and naturally misses prefix-only keys", async () => {
    expect("contentHashForFile" in persistentMapCacheModule).toBe(true);
    const retiredPrefixHelper = ["contentHashFor", "64k"].join("");
    expect(retiredPrefixHelper in persistentMapCacheModule).toBe(false);

    const p1 = mk();
    const p2 = mk();
    const prefix = Buffer.alloc(8 * 1024 * 1024, 0x61);
    const tailA = Buffer.from("tail-A");
    const tailB = Buffer.from("tail-B");
    await writeFile(p1, Buffer.concat([prefix, tailA]));
    await writeFile(p2, Buffer.concat([prefix, tailB]));

    const startedAt = performance.now();
    const [hashA, hashB] = await Promise.all([
      contentHashForFile(p1),
      contentHashForFile(p2),
    ]);
    const elapsedMs = performance.now() - startedAt;

    expect(hashA).not.toBe(hashB);
    expect(elapsedMs).toBeLessThan(5_000);

    const { h32Raw } = await xxhashWasm();
    const legacyPrefixHash = (h32Raw(prefix.subarray(0, 64 * 1024), 0) >>> 0)
      .toString(16)
      .padStart(8, "0");
    expect(hashA).not.toBe(legacyPrefixHash);

    const mtimeMs = (await fsStat(p1)).mtimeMs;
    expect(computeKey(p1, mtimeMs, hashA, "typescript", 1)).not.toBe(
      computeKey(p1, mtimeMs, legacyPrefixHash, "typescript", 1),
    );
  });

  it("returns non-empty hex string", async () => {
    const p = mk();
    await writeFile(p, "abc");
    expect(await contentHashForFile(p)).toMatch(/^[0-9a-f]+$/);
  });
});

describe("readCached", () => {
  const dir = join(tmpdir(), `pmc-read-${randomBytes(6).toString("hex")}`);

  beforeEach(async () => {
    delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    process.env.PI_HASHLINE_MAP_CACHE_DIR = dir;
    await mkdir(dir, { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = "1";
  });

  it("returns null when the cache file does not exist", async () => {
    expect(await readCached("missing-key")).toBeNull();
  });

  it("returns null when the file contains invalid JSON", async () => {
    await writeFile(join(dir, "corrupt.json"), "{not json");
    expect(await readCached("corrupt")).toBeNull();
  });

  it("returns null when valid JSON is not a FileMap", async () => {
    await writeFile(join(dir, "wrong-shape.json"), JSON.stringify({ nope: true }));
    expect(await readCached("wrong-shape")).toBeNull();
  });

  it("returns the parsed FileMap when valid", async () => {
    const map = {
      path: "/x",
      totalLines: 1,
      totalBytes: 1,
      language: "typescript",
      symbols: [],
      imports: [],
      detailLevel: "outline",
    };
    await writeCachedRaw("ok-key", map as any);
    const out = await readCached("ok-key");
    expect(out).toEqual(map);
  });
});


describe("writeCached atomicity", () => {
  const dir = join(tmpdir(), `pmc-atomic-${randomBytes(6).toString("hex")}`);

  beforeEach(async () => {
    delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    process.env.PI_HASHLINE_MAP_CACHE_DIR = dir;
    await mkdir(dir, { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = "1";
  });

  it("leaves exactly one <key>.json file after success", async () => {
    const m = {
      path: "/x",
      totalLines: 1,
      totalBytes: 1,
      language: "typescript",
      symbols: [],
      imports: [],
      detailLevel: "outline",
    } as any;

    await writeCached("atomic-key", m);

    const entries = await readdir(dir);
    expect(entries).toEqual(["atomic-key.json"]);
  });

  it("writes through a temp sibling (no <key>.json ever partial) — readCached returns parsed map", async () => {
    const m = {
      path: "/y",
      totalLines: 2,
      totalBytes: 2,
      language: "python",
      symbols: [],
      imports: [],
      detailLevel: "outline",
    } as any;

    await writeCached("atomic-key-2", m);

    const out = await readCached("atomic-key-2");
    expect(out).toEqual(m);
  });
});

describe("writeCached concurrency", () => {
  const dir = join(tmpdir(), `pmc-conc-${randomBytes(6).toString("hex")}`);

  beforeEach(async () => {
    delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    process.env.PI_HASHLINE_MAP_CACHE_DIR = dir;
    await mkdir(dir, { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = "1";
  });

  it("10 concurrent writes to the same key produce one readable JSON (no truncation)", async () => {
    const make = (i: number) => ({
      path: `/x/${i}`,
      totalLines: i,
      totalBytes: i * 2,
      language: "typescript",
      symbols: [],
      imports: [],
      detailLevel: "outline",
    });

    await Promise.all(Array.from({ length: 10 }, (_, i) => writeCached("conc-key", make(i) as any)));

    const entries = (await readdir(dir)).filter((e) => e.endsWith(".json"));
    expect(entries).toEqual(["conc-key.json"]);

    const parsed = await readCached("conc-key");
    expect(parsed).not.toBeNull();
    expect(typeof (parsed as any).language).toBe("string");
  });
});

describe("writeCached eviction", () => {
  const dir = join(tmpdir(), `pmc-evict-${randomBytes(6).toString("hex")}`);

  beforeEach(async () => {
    delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    process.env.PI_HASHLINE_MAP_CACHE_DIR = dir;
    await mkdir(dir, { recursive: true });
    __resetWriteCounter();
  });
  afterEach(async () => {
    __setEvictionHooksForTest(null);
    await rm(dir, { recursive: true, force: true });
    delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = "1";
  });

  it("trips every Nth write and caps entry count", async () => {
    __setEvictionHooksForTest({ interval: 3, cap: 2 });
    const m = (n: number) => ({
      path: `/x/${n}`,
      totalLines: 1,
      totalBytes: 1,
      language: "t",
      symbols: [],
      imports: [],
      detailLevel: "outline",
    }) as any;

    const oldKey = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const midKey = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const newKey = "cccccccccccccccccccccccccccccccc";

    await writeCached(oldKey, m(1));
    await utimes(join(dir, `${oldKey}.json`), new Date(Date.now() - 3000), new Date(Date.now() - 3000));
    await writeCached(midKey, m(2));
    await utimes(join(dir, `${midKey}.json`), new Date(Date.now() - 2000), new Date(Date.now() - 2000));
    await writeCached(newKey, m(3));

    const entries = (await readdir(dir)).filter((e) => e.endsWith(".json")).sort();
    expect(entries).toEqual([`${midKey}.json`, `${newKey}.json`]);
  });


  it("does not evict unrelated JSON files in the configured cache directory", async () => {
    __setEvictionHooksForTest({ interval: 2, cap: 1 });
    const map = {
      path: "/x",
      totalLines: 1,
      totalBytes: 1,
      language: "t",
      symbols: [],
      imports: [],
      detailLevel: "outline",
    } as any;
    const oldKey = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const newKey = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    await writeFile(join(dir, "settings.json"), "{}", "utf8");
    await writeCached(oldKey, map);
    await utimes(join(dir, `${oldKey}.json`), new Date(Date.now() - 3000), new Date(Date.now() - 3000));
    await writeCached(newKey, map);

    const entries = (await readdir(dir)).filter((e) => e.endsWith(".json")).sort();
    expect(entries).toEqual([`${newKey}.json`, "settings.json"]);
  });
});

describe("eviction errors are swallowed", () => {
  const fileBlocker = join(tmpdir(), `pmc-evict-err-${randomBytes(6).toString("hex")}`);
  const badDir = join(fileBlocker, "maps");

  beforeEach(async () => {
    delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    process.env.PI_HASHLINE_MAP_CACHE_DIR = badDir;
    await writeFile(fileBlocker, "");
    __resetWriteCounter();
  });
  afterEach(async () => {
    __setEvictionHooksForTest(null);
    try {
      await unlink(fileBlocker);
    } catch {}
    delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = "1";
  });

  it("writeCached does not throw even when eviction cannot scan the cache dir", async () => {
    __setEvictionHooksForTest({ interval: 1, cap: 0 });
    const m = {
      path: "/x",
      totalLines: 1,
      totalBytes: 1,
      language: "t",
      symbols: [],
      imports: [],
      detailLevel: "outline",
    } as any;

    await expect(writeCached("ghost", m)).resolves.toBeUndefined();
  });
});


describe("getOrGenerateMap — disk hit", () => {
  const dir = join(tmpdir(), `pmc-hit-${randomBytes(6).toString("hex")}`);
  const savedNoPersist = process.env.PI_HASHLINE_NO_PERSIST_MAPS;
  const tmpFiles: string[] = [];

  beforeEach(async () => {
    delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    process.env.PI_HASHLINE_MAP_CACHE_DIR = dir;
    await mkdir(dir, { recursive: true });
    clearMapCache();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const p of tmpFiles.splice(0)) {
      try {
        await unlink(p);
      } catch {}
    }
    await rm(dir, { recursive: true, force: true });
    delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = savedNoPersist;
  });

  it("returns cached map without invoking map generation when disk cache is warm", async () => {
    const srcPath = join(tmpdir(), `pmc-src-${randomBytes(6).toString("hex")}.ts`);
    tmpFiles.push(srcPath);
    await writeFile(srcPath, "export const x = 1;\n");

    const first = await getOrGenerateMap(srcPath);
    expect(first).not.toBeNull();

    clearMapCache();
    const generateMapSpy = vi.spyOn(mapperModule, "generateMap");
    const generateMapWithIdentitySpy = vi.spyOn(mapperModule, "generateMapWithIdentity");

    const second = await getOrGenerateMap(srcPath);
    expect(second).not.toBeNull();
    expect(second!.path).toBe(srcPath);
    expect(generateMapSpy).not.toHaveBeenCalled();
    expect(generateMapWithIdentitySpy).not.toHaveBeenCalled();
  });
});


describe("getOrGenerateMap — disk miss writes", () => {
  const dir = join(tmpdir(), `pmc-miss-${randomBytes(6).toString("hex")}`);
  const savedNoPersist = process.env.PI_HASHLINE_NO_PERSIST_MAPS;
  const tmpFiles: string[] = [];

  beforeEach(async () => {
    delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    process.env.PI_HASHLINE_MAP_CACHE_DIR = dir;
    await mkdir(dir, { recursive: true });
    clearMapCache();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const p of tmpFiles.splice(0)) {
      try {
        await unlink(p);
      } catch {}
    }
    await rm(dir, { recursive: true, force: true });
    delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = savedNoPersist;
  });
  it("writes a cache file to disk after generating a fresh map", async () => {
    const srcPath = join(tmpdir(), `pmc-miss-src-${randomBytes(6).toString("hex")}.ts`);
    tmpFiles.push(srcPath);
    await writeFile(srcPath, "export const z = 42;\n");
    const writeCachedSpy = vi.spyOn(persistentMapCacheModule, "writeCached");
    const result = await getOrGenerateMap(srcPath);
    expect(result).not.toBeNull();
    expect(writeCachedSpy).toHaveBeenCalledTimes(1);

    await new Promise((r) => setImmediate(r));
    const entries = (await readdir(dir)).filter((e) => e.endsWith(".json"));
    expect(entries.length).toBeGreaterThanOrEqual(1);
});


  it("skips persistent lookup and write when the content hash cannot be computed", async () => {
    const srcPath = join(tmpdir(), `pmc-miss-src-${randomBytes(6).toString("hex")}.ts`);
    tmpFiles.push(srcPath);
    await writeFile(srcPath, "export const noHash = 1;\n");

    const contentHashSpy = vi
      .spyOn(persistentMapCacheModule, "contentHashForFile")
      .mockResolvedValue("");
    const readCachedSpy = vi.spyOn(persistentMapCacheModule, "readCached");
    const writeCachedSpy = vi.spyOn(persistentMapCacheModule, "writeCached");

    const result = await getOrGenerateMap(srcPath);
    expect(result).not.toBeNull();
    expect(contentHashSpy).toHaveBeenCalledTimes(1);
    expect(readCachedSpy).not.toHaveBeenCalled();
    expect(writeCachedSpy).not.toHaveBeenCalled();
  });

  it("reuses the written cache entry on the next lookup when generation falls back", async () => {
    const srcPath = join(tmpdir(), `pmc-miss-src-${randomBytes(6).toString("hex")}.md`);
    tmpFiles.push(srcPath);
    await writeFile(srcPath, "function fallbackHit() {}\n");

    const first = await getOrGenerateMap(srcPath);
    expect(first).not.toBeNull();

    await new Promise((r) => setImmediate(r));
    const entries = (await readdir(dir)).filter((e) => e.endsWith(".json"));
    expect(entries.length).toBeGreaterThanOrEqual(1);

    clearMapCache();
    const generateMapWithIdentitySpy = vi.spyOn(mapperModule, "generateMapWithIdentity");

    const second = await getOrGenerateMap(srcPath);
    expect(second).not.toBeNull();
    expect(generateMapWithIdentitySpy).not.toHaveBeenCalled();
  });
});

describe("getOrGenerateMap — opt-out env var", () => {
  const dir = join(tmpdir(), `pmc-off-${randomBytes(6).toString("hex")}`);
  const tmpFiles: string[] = [];

  beforeEach(async () => {
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = "1";
    process.env.PI_HASHLINE_MAP_CACHE_DIR = dir;
    await mkdir(dir, { recursive: true });
    clearMapCache();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const p of tmpFiles.splice(0)) {
      try {
        await unlink(p);
      } catch {}
    }
    await rm(dir, { recursive: true, force: true });
    delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = "1";
  });

  it("does not consult or write the persistent cache when NO_PERSIST is on", async () => {
    const srcPath = join(tmpdir(), `pmc-off-src-${randomBytes(6).toString("hex")}.ts`);
    tmpFiles.push(srcPath);
    await writeFile(srcPath, "export const q = 1;\n");

    const readCachedSpy = vi.spyOn(persistentMapCacheModule, "readCached");
    const writeCachedSpy = vi.spyOn(persistentMapCacheModule, "writeCached");
    const contentHashSpy = vi.spyOn(persistentMapCacheModule, "contentHashForFile");

    const result = await getOrGenerateMap(srcPath);
    expect(result).not.toBeNull();
    expect(readCachedSpy).not.toHaveBeenCalled();
    expect(writeCachedSpy).not.toHaveBeenCalled();
    // contentHashForFile is called for in-memory cache validation even when persistence is off
    expect(contentHashSpy).toHaveBeenCalled();

    await new Promise((r) => setImmediate(r));
    const entries = await readdir(dir);
    expect(entries).toEqual([]);
  });

  it("persistent cache helpers themselves no-op when NO_PERSIST is on", async () => {
    const map = {
      path: "/opt-out",
      totalLines: 1,
      totalBytes: 1,
      language: "typescript",
      symbols: [],
      imports: [],
      detailLevel: "outline",
    } as any;

    await writeCached("off-key", map);
    expect(await readCached("off-key")).toBeNull();
    expect(await readdir(dir)).toEqual([]);
  });
});

describe("MAPPER_VERSION bump invalidates cache", () => {
  const dir = join(tmpdir(), `pmc-ver-${randomBytes(6).toString("hex")}`);
  const tmpFiles: string[] = [];

  beforeEach(async () => {
    delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    process.env.PI_HASHLINE_MAP_CACHE_DIR = dir;
    await mkdir(dir, { recursive: true });
    clearMapCache();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const p of tmpFiles.splice(0)) {
      try {
        await unlink(p);
      } catch {}
    }
    await rm(dir, { recursive: true, force: true });
    delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = "1";
  });

  it("bumping a mapper's version forces regeneration", async () => {
    const srcPath = join(tmpdir(), `pmc-ver-src-${randomBytes(6).toString("hex")}.ts`);
    tmpFiles.push(srcPath);
    await writeFile(srcPath, "export const v = 1;\n");

    const first = await getOrGenerateMap(srcPath);
    expect(first).not.toBeNull();

    const original = mapperModule.ALL_MAPPER_IDENTITIES.typescript;
    mapperModule.ALL_MAPPER_IDENTITIES.typescript = {
      mapperName: "typescript",
      mapperVersion: original.mapperVersion + 1,
    };

    try {
      clearMapCache();
      const spy = vi.spyOn(mapperModule, "generateMapWithIdentity");
      const second = await getOrGenerateMap(srcPath);
      expect(second).not.toBeNull();
      expect(spy).toHaveBeenCalledTimes(1);

      clearMapCache();
      const third = await getOrGenerateMap(srcPath);
      expect(third).not.toBeNull();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      mapperModule.ALL_MAPPER_IDENTITIES.typescript = original;
    }
  });
});


describe("mtime change invalidates", () => {
  const dir = join(tmpdir(), `pmc-mtime-${randomBytes(6).toString("hex")}`);
  const tmpFiles: string[] = [];

  beforeEach(async () => {
    delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    process.env.PI_HASHLINE_MAP_CACHE_DIR = dir;
    await mkdir(dir, { recursive: true });
    clearMapCache();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const p of tmpFiles.splice(0)) {
      try {
        await unlink(p);
      } catch {}
    }
    await rm(dir, { recursive: true, force: true });
    delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = "1";
  });

  it("regenerates when mtime moves forward", async () => {
    const srcPath = join(tmpdir(), `pmc-mtime-src-${randomBytes(6).toString("hex")}.ts`);
    tmpFiles.push(srcPath);
    await writeFile(srcPath, "export const m = 1;\n");
    await getOrGenerateMap(srcPath);
    clearMapCache();
    const future = new Date(Date.now() + 5000);
    await utimes(srcPath, future, future);
    const spy = vi.spyOn(mapperModule, "generateMapWithIdentity");
    const second = await getOrGenerateMap(srcPath);
    expect(second).not.toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not persist a stale map when the file changes during generation", async () => {
    const srcPath = join(tmpdir(), `pmc-race-src-${randomBytes(6).toString("hex")}.ts`);
    tmpFiles.push(srcPath);
    await writeFile(srcPath, "export const before = 1;\n");

    await getOrGenerateMap(srcPath);
    clearMapCache();
    const mid = new Date(Date.now() + 2500);
    await utimes(srcPath, mid, mid);
    const realGenerateMapWithIdentity = mapperModule.generateMapWithIdentity;
    const future = new Date(Date.now() + 5000);
    const spy = vi
      .spyOn(mapperModule, "generateMapWithIdentity")
      .mockImplementationOnce(async (filePath, options) => {
        const result = await realGenerateMapWithIdentity(filePath, options);
        await writeFile(filePath, "export const after = 2;\n");
        await utimes(filePath, future, future);
        return result;
      });
    const second = await getOrGenerateMap(srcPath);
    expect(second).not.toBeNull();
    clearMapCache();
    const third = await getOrGenerateMap(srcPath);
    expect(third).not.toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
});

});

describe("contentHash invalidation when mtime is reset", () => {
  const dir = join(tmpdir(), `pmc-content-${randomBytes(6).toString("hex")}`);
  const tmpFiles: string[] = [];

  beforeEach(async () => {
    delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    process.env.PI_HASHLINE_MAP_CACHE_DIR = dir;
    await mkdir(dir, { recursive: true });
    clearMapCache();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const p of tmpFiles.splice(0)) {
      try {
        await unlink(p);
      } catch {}
    }
    await rm(dir, { recursive: true, force: true });
    delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = "1";
  });

  it("regenerates when content changes even if mtime is pinned", async () => {
    const srcPath = join(tmpdir(), `pmc-content-src-${randomBytes(6).toString("hex")}.ts`);
    tmpFiles.push(srcPath);
    const t0 = new Date();

    await writeFile(srcPath, "export const original = 1;\n");
    await utimes(srcPath, t0, t0);
    await getOrGenerateMap(srcPath);
    clearMapCache();

    await writeFile(srcPath, "export const changed = 2;\n");
    await utimes(srcPath, t0, t0);

    const spy = vi.spyOn(mapperModule, "generateMapWithIdentity");
    const second = await getOrGenerateMap(srcPath);
    expect(second).not.toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("regenerates when a same-length rename after 64 KiB preserves mtime", async () => {
    const srcPath = join(tmpdir(), `pmc-content-tail-${randomBytes(6).toString("hex")}.ts`);
    tmpFiles.push(srcPath);
    const prefix = " ".repeat(64 * 1024);
    const before = `${prefix}export function oldName(): void {}\n`;
    const after = `${prefix}export function newName(): void {}\n`;
    const pinnedTime = new Date(Date.now() - 10_000);

    expect(Buffer.byteLength(after)).toBe(Buffer.byteLength(before));
    expect(before.indexOf("oldName")).toBeGreaterThanOrEqual(64 * 1024);

    await writeFile(srcPath, before);
    await utimes(srcPath, pinnedTime, pinnedTime);
    const pinnedMtimeMs = (await fsStat(srcPath)).mtimeMs;
    const first = await getOrGenerateMap(srcPath);
    expect(first).not.toBeNull();
    expect(first!.symbols.some((s) => s.name === "oldName")).toBe(true);
    clearMapCache();

    await writeFile(srcPath, after);
    await utimes(srcPath, pinnedTime, pinnedTime);
    expect((await fsStat(srcPath)).mtimeMs).toBe(pinnedMtimeMs);

    const second = await getOrGenerateMap(srcPath);
    expect(second).not.toBeNull();
    const secondNames = second!.symbols.map((symbol) => symbol.name);
    expect(secondNames).toEqual(expect.arrayContaining(["newName"]));
    expect(secondNames).not.toContain("oldName");
  });
});

describe("corrupt cache file is overwritten", () => {
  const dir = join(tmpdir(), `pmc-corrupt-${randomBytes(6).toString("hex")}`);
  const tmpFiles: string[] = [];

  beforeEach(async () => {
    delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    process.env.PI_HASHLINE_MAP_CACHE_DIR = dir;
    await mkdir(dir, { recursive: true });
    clearMapCache();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const p of tmpFiles.splice(0)) {
      try {
        await unlink(p);
      } catch {}
    }
    await rm(dir, { recursive: true, force: true });
    delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = "1";
  });

  it("returns a valid FileMap and overwrites the bad file", async () => {
    const srcPath = join(tmpdir(), `pmc-corrupt-src-${randomBytes(6).toString("hex")}.ts`);
    tmpFiles.push(srcPath);
    await writeFile(srcPath, "export const c = 1;\n");

    const identity = mapperModule.ALL_MAPPER_IDENTITIES.typescript;
    const s = await fsStat(srcPath);
    const ch = await contentHashForFile(srcPath);
    const key = computeKey(
      srcPath,
      s.mtimeMs,
      ch,
      identity.mapperName,
      identity.mapperVersion,
    );
    await writeFile(join(dir, `${key}.json`), "{not valid json");

    const generateMapWithIdentitySpy = vi.spyOn(mapperModule, "generateMapWithIdentity");
    const result = await getOrGenerateMap(srcPath);
    expect(result).not.toBeNull();
    expect(result!.language.toLowerCase()).toBe("typescript");
    expect(generateMapWithIdentitySpy).toHaveBeenCalledTimes(1);
    await new Promise((r) => setImmediate(r));
    const after = await readFile(join(dir, `${key}.json`), "utf-8");
    expect(() => JSON.parse(after)).not.toThrow();
  });
});


describe("unwritable cache dir degrades silently", () => {
  const fileBlocker = join(tmpdir(), `pmc-block-${randomBytes(6).toString("hex")}`);
  const badDir = join(fileBlocker, "maps");
  const tmpFiles: string[] = [];

  beforeEach(async () => {
    delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    await writeFile(fileBlocker, "");
    process.env.PI_HASHLINE_MAP_CACHE_DIR = badDir;
    clearMapCache();
  });

  afterEach(async () => {
    for (const p of tmpFiles.splice(0)) {
      try {
        await unlink(p);
      } catch {}
    }
    try {
      await unlink(fileBlocker);
    } catch {}
    delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = "1";
  });

  it("getOrGenerateMap returns a valid FileMap and does not throw", async () => {
    const srcPath = join(tmpdir(), `pmc-unw-src-${randomBytes(6).toString("hex")}.ts`);
    tmpFiles.push(srcPath);
    await writeFile(srcPath, "export const u = 1;\n");

    await expect(getOrGenerateMap(srcPath)).resolves.not.toBeNull();
  });
});