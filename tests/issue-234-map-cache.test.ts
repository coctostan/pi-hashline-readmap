import { expect, it, vi } from "vitest";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { clearMapCache, getOrGenerateMap } from "../src/map-cache.js";
import {
  computeKey,
  contentHashForFile,
  writeCachedRaw,
} from "../src/persistent-map-cache.js";
import { DetailLevel, SymbolKind } from "../src/readmap/enums.js";
import * as mapperModule from "../src/readmap/mapper.js";
import type { FileMap } from "../src/readmap/types.js";

it("does not reuse a stale in-memory empty map", async () => {
  const root = await mkdtemp(join(tmpdir(), "issue-234-memory-cache-"));
  const filePath = join(root, "sample.txt");
  const previousNoPersist = process.env.PI_HASHLINE_NO_PERSIST_MAPS;

  try {
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = "1";
    await writeFile(filePath, "plain text\n", "utf8");
    clearMapCache();

    const emptyMap: FileMap = {
      path: filePath,
      totalLines: 1,
      totalBytes: 11,
      language: "Text",
      symbols: [],
      imports: [],
      detailLevel: DetailLevel.Full,
    };
    const regeneratedMap: FileMap = {
      ...emptyMap,
      symbols: [
        {
          name: "recovered",
          kind: SymbolKind.Function,
          startLine: 1,
          endLine: 1,
        },
      ],
    };

    const generate = vi
      .spyOn(mapperModule, "generateMap")
      .mockResolvedValueOnce(emptyMap)
      .mockResolvedValueOnce(regeneratedMap);

    const first = await getOrGenerateMap(filePath);
    const second = await getOrGenerateMap(filePath);

    expect({
      firstSymbolCount: first?.symbols.length ?? -1,
      secondSymbolCount: second?.symbols.length ?? -1,
      generationCalls: generate.mock.calls.length,
    }).toEqual({
      firstSymbolCount: 0,
      secondSymbolCount: 1,
      generationCalls: 2,
    });
  } finally {
    vi.restoreAllMocks();
    clearMapCache();
    if (previousNoPersist === undefined) {
      delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    } else {
      process.env.PI_HASHLINE_NO_PERSIST_MAPS = previousNoPersist;
    }
    await rm(root, { recursive: true, force: true });
  }
});

it("skips an empty dedicated disk entry in favor of a cached fallback map", async () => {
  const root = await mkdtemp(join(tmpdir(), "issue-234-disk-cache-"));
  const cacheDir = join(root, "cache");
  const filePath = join(root, "sample.ts");
  const previousNoPersist = process.env.PI_HASHLINE_NO_PERSIST_MAPS;
  const previousCacheDir = process.env.PI_HASHLINE_MAP_CACHE_DIR;

  try {
    delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    process.env.PI_HASHLINE_MAP_CACHE_DIR = cacheDir;
    await writeFile(filePath, "export const recovered = 1;\n", "utf8");
    clearMapCache();

    const fileStat = await stat(filePath);
    const contentHash = await contentHashForFile(filePath);
    const dedicated = mapperModule.ALL_MAPPER_IDENTITIES.typescript;
    const fallback = mapperModule.ALL_MAPPER_IDENTITIES.fallback;

    // Fixed-When 5: this fix deliberately does not bump mapper versions. Stale
    // empty entries are rejected semantically (isUsefulMap) instead of by
    // cache-key invalidation, so the dedicated identity below is unchanged.
    expect(dedicated).toEqual({ mapperName: "typescript", mapperVersion: 2 });

    const emptyMap: FileMap = {
      path: filePath,
      totalLines: 1,
      totalBytes: fileStat.size,
      language: "TypeScript",
      symbols: [],
      imports: [],
      detailLevel: DetailLevel.Full,
    };
    const fallbackMap: FileMap = {
      ...emptyMap,
      symbols: [
        {
          name: "recovered",
          kind: SymbolKind.Function,
          startLine: 1,
          endLine: 1,
        },
      ],
      detailLevel: DetailLevel.Minimal,
    };

    await writeCachedRaw(
      computeKey(
        filePath,
        fileStat.mtimeMs,
        contentHash,
        dedicated.mapperName,
        dedicated.mapperVersion,
      ),
      emptyMap,
    );
    await writeCachedRaw(
      computeKey(
        filePath,
        fileStat.mtimeMs,
        contentHash,
        fallback.mapperName,
        fallback.mapperVersion,
      ),
      fallbackMap,
    );

    const generate = vi.spyOn(mapperModule, "generateMapWithIdentity");
    const result = await getOrGenerateMap(filePath);

    expect({
      names: result?.symbols.map((symbol) => symbol.name) ?? [],
      generationCalls: generate.mock.calls.length,
    }).toEqual({
      names: ["recovered"],
      generationCalls: 0,
    });
  } finally {
    vi.restoreAllMocks();
    clearMapCache();
    if (previousNoPersist === undefined) {
      delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    } else {
      process.env.PI_HASHLINE_NO_PERSIST_MAPS = previousNoPersist;
    }
    if (previousCacheDir === undefined) {
      delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
    } else {
      process.env.PI_HASHLINE_MAP_CACHE_DIR = previousCacheDir;
    }
    await rm(root, { recursive: true, force: true });
  }
});
