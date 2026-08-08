import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { registerGrepTool } from "../src/grep.js";
import { ensureHashInit } from "../src/hashline.js";
import { clearMapCache } from "../src/map-cache.js";
import { registerReadTool } from "../src/read.js";
import { sqlMapper } from "../src/readmap/mappers/sql.js";
import { findEnclosingSgSymbols } from "../src/sg.js";

const dirs: string[] = [];

async function fixture(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "issue-242-consumers-"));
  dirs.push(dir);
  const filePath = join(dir, "tagged.sql");
  await writeFile(filePath, content, "utf8");
  return filePath;
}

function captureTool(register: (pi: any) => void): any {
  let tool: any;
  register({
    registerTool(definition: any) {
      tool = definition;
    },
  });
  if (!tool) throw new Error("tool was not registered");
  return tool;
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

beforeAll(async () => {
  await ensureHashInit();
});

beforeEach(() => {
  clearMapCache();
});

afterAll(async () => {
  for (const dir of dirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

it("propagates a tagged function boundary without consuming its neighbor", async () => {
  const filePath = await fixture(
    [
      "CREATE FUNCTION consumer_fn() RETURNS int AS $body$",
      "  SELECT '$other$;'::text;",
      "$body$ LANGUAGE SQL;",
      "CREATE TABLE after_fn (id int);",
    ].join("\n"),
  );
  const map = await sqlMapper(filePath);
  const functionSymbol = map?.symbols.find(
    (symbol) => symbol.name === "FUNCTION consumer_fn",
  );
  if (functionSymbol?.endLine !== 3) {
    throw new Error(
      `expected tagged function endLine 3, received ${functionSymbol?.endLine ?? "missing"}`,
    );
  }
  expect(map?.symbols).toContainEqual(
    expect.objectContaining({ name: "TABLE after_fn", startLine: 4, endLine: 4 }),
  );

  const readTool = captureTool((pi) => registerReadTool(pi));
  const readResult = await runTool(
    readTool,
    "issue-242-read",
    { path: filePath, symbol: "FUNCTION consumer_fn" },
    filePath,
  );
  const readText = (readResult.content as any[]).find((item) => item.type === "text")?.text ?? "";
  expect(readText).toContain("$body$ LANGUAGE SQL;");
  expect(readText).not.toContain("CREATE TABLE after_fn");

  const grepTool = captureTool((pi) => registerGrepTool(pi));
  const grepResult = await runTool(
    grepTool,
    "issue-242-grep",
    { pattern: "LANGUAGE", path: filePath, literal: true, scope: "symbol" },
    filePath,
  );
  expect(grepResult.details?.ptcValue?.scopes?.groups?.[0]?.symbol?.name).toBe(
    "FUNCTION consumer_fn",
  );

  await expect(
    findEnclosingSgSymbols(filePath, [{ startLine: 3, endLine: 3 }]),
  ).resolves.toContainEqual(
    expect.objectContaining({ name: "FUNCTION consumer_fn" }),
  );
});
