import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import { clearMapCache } from "../src/map-cache.js";
import { SymbolKind } from "../src/readmap/enums.js";
import { jsonMapper } from "../src/readmap/mappers/json.js";
import { findEnclosingSgSymbols } from "../src/sg.js";

const cleanup: string[] = [];

beforeEach(() => {
  clearMapCache();
  execFileMock.mockImplementation(
    (
      _command: string,
      args: string[],
      _options: unknown,
      callback: (
        error: Error | null,
        result: { stdout: string; stderr: string },
      ) => void,
    ) => {
      const stdout = args[0] === "--version"
        ? "jq-1.8.2\n"
        : '{"[]":{"id":"number"},"_count":2}\n';
      callback(null, { stdout, stderr: "" });
      return {};
    },
  );
});

afterEach(async () => {
  clearMapCache();
  execFileMock.mockReset();
  await Promise.all(
    cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

it("maps every root array element for enclosing-symbol lookup", async () => {
  const source = [
    "[",
    "  {",
    '    "id": 1',
    "  },",
    "  {",
    '    "id": 2',
    "  }",
    "]",
  ].join("\n");
  const dir = await mkdtemp(join(tmpdir(), "json-root-array-"));
  cleanup.push(dir);
  const filePath = join(dir, "items.json");
  await writeFile(filePath, source, "utf8");

  const map = await jsonMapper(filePath);
  expect(map?.symbols).toMatchObject([
    { name: "[0]", startLine: 2, endLine: 4 },
    { name: "[1]", startLine: 5, endLine: 7 },
  ]);

  await expect(
    findEnclosingSgSymbols(filePath, [{ startLine: 5, endLine: 7 }]),
  ).resolves.toEqual([
    { name: "[1]", kind: SymbolKind.Property },
  ]);
});
