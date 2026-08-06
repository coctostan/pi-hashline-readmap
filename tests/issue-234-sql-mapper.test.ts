import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { registerGrepTool } from "../src/grep.js";
import { ensureHashInit } from "../src/hashline.js";
import { clearMapCache } from "../src/map-cache.js";
import { registerReadTool } from "../src/read.js";
import { generateMapWithIdentity } from "../src/readmap/mapper.js";
import { fallbackMapper } from "../src/readmap/mappers/fallback.js";
import { sqlMapper } from "../src/readmap/mappers/sql.js";
import { findSymbol } from "../src/readmap/symbol-lookup.js";
import type { FileMap } from "../src/readmap/types.js";
import { findEnclosingSgSymbols } from "../src/sg.js";
import { registerWriteTool } from "../src/write.js";

const DDL = "CREATE TABLE [users] (id int);\n";
const COMMENT_ONLY = "-- comment only\n";
const dirs: string[] = [];

async function fixture(name: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "issue-234-sql-"));
  dirs.push(dir);
  const filePath = join(dir, name);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

function captureTool(register: (pi: any) => void): any {
  let tool: any = null;
  register({
    registerTool(definition: any) {
      tool = definition;
    },
  });
  if (!tool) throw new Error("tool was not registered");
  return tool;
}

function textOf(result: any): string {
  return result.content?.find((item: any) => item.type === "text")?.text ?? "";
}

function runTool(tool: any, callId: string, params: unknown, filePath: string) {
  return tool.execute(
    callId,
    params,
    new AbortController().signal,
    () => {},
    { cwd: dirname(filePath) },
  );
}

/** Dispatch must skip the dedicated SQL mapper and recover a non-empty map. */
async function recoveredMap(filePath: string): Promise<FileMap> {
  const dispatched = await generateMapWithIdentity(filePath);
  expect(dispatched.mapperName).not.toBe("sql");
  expect(dispatched.map).not.toBeNull();
  expect(dispatched.map!.symbols.length).toBeGreaterThan(0);
  return dispatched.map!;
}

beforeAll(async () => {
  await ensureHashInit();
});

beforeEach(() => {
  clearMapCache();
});

afterAll(async () => {
  for (const dir of dirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

it("treats a symbol-less SQL extraction as a mapper miss", async () => {
  const filePath = await fixture("empty.sql", COMMENT_ONLY);

  await expect(sqlMapper(filePath)).resolves.toBeNull();
});

it("lets the bracketed-table reproduction reach ctags/regex fallback", async () => {
  const filePath = await fixture("dispatch.sql", DDL);

  const directFallback = await fallbackMapper(filePath);
  expect(directFallback?.symbols).toHaveLength(1);

  await recoveredMap(filePath);

  const allStagesMiss = await generateMapWithIdentity(
    await fixture("all-miss.sql", COMMENT_ONLY),
  );
  expect(allStagesMiss).toMatchObject({ map: null, mapperName: "fallback" });
});

it("finds the recovered symbol through symbol lookup", async () => {
  const filePath = await fixture("dispatch.sql", DDL);
  const map = await recoveredMap(filePath);

  expect(findSymbol(map, map.symbols[0]!.name).type).toBe("found");
});

it("appends the recovered map to read output", async () => {
  const filePath = await fixture("dispatch.sql", DDL);
  const map = await recoveredMap(filePath);
  const readTool = captureTool((pi) => registerReadTool(pi));

  const result = await runTool(
    readTool,
    "map-read",
    { path: filePath, map: true },
    filePath,
  );

  expect(result.isError).not.toBe(true);
  expect(textOf(result)).toContain("File Map: dispatch.sql");
  expect(textOf(result)).toContain(map.symbols[0]!.name);
});

it("reads the recovered symbol body", async () => {
  const filePath = await fixture("dispatch.sql", DDL);
  const map = await recoveredMap(filePath);
  const readTool = captureTool((pi) => registerReadTool(pi));

  const result = await runTool(
    readTool,
    "symbol-read",
    { path: filePath, symbol: map.symbols[0]!.name },
    filePath,
  );

  expect(result.isError).not.toBe(true);
  // Without this guard the assertion below also passes on read's not-found path,
  // which falls back to dumping the whole (one-line) file after a warning.
  expect(textOf(result)).not.toContain("not found. Available symbols");
  expect(textOf(result)).toContain("CREATE TABLE [users]");
});

it("appends the recovered map to write output", async () => {
  const filePath = await fixture("dispatch.sql", DDL);
  const map = await recoveredMap(filePath);
  const writeTool = captureTool((pi) => registerWriteTool(pi));

  const result = await runTool(
    writeTool,
    "map-write",
    { path: filePath, content: DDL, map: true },
    filePath,
  );

  expect(result.isError).not.toBe(true);
  expect(textOf(result)).toContain("File Map: dispatch.sql");
  expect(textOf(result)).toContain(map.symbols[0]!.name);
});

it("groups symbol-scoped grep matches under a recovered symbol", async () => {
  const filePath = await fixture("dispatch.sql", DDL);
  const map = await recoveredMap(filePath);
  const grepTool = captureTool((pi) => registerGrepTool(pi));

  const result = await runTool(
    grepTool,
    "symbol-grep",
    { pattern: "id", path: filePath, literal: true, scope: "symbol" },
    filePath,
  );

  const group = result.details?.ptcValue?.scopes?.groups?.[0];
  expect(group).toBeDefined();
  expect(map.symbols.map((symbol) => symbol.name)).toContain(group.symbol.name);
});

it("reports a recovered symbol as the enclosing AST-search symbol", async () => {
  const filePath = await fixture("dispatch.sql", DDL);
  const map = await recoveredMap(filePath);

  const enclosing = await findEnclosingSgSymbols(filePath, [
    { startLine: 1, endLine: 1 },
  ]);

  expect(enclosing.length).toBeGreaterThan(0);
  expect(map.symbols.map((symbol) => symbol.name)).toContain(
    enclosing[0]!.name,
  );
});
