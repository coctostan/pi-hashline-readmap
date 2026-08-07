import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import { jsonMapper } from "../src/readmap/mappers/json.js";

const cleanup: string[] = [];

beforeEach(() => {
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
        : '{"server":"{...}","other":"boolean"}\n';
      callback(null, { stdout, stderr: "" });
      return {};
    },
  );
});

afterEach(async () => {
  execFileMock.mockReset();
  await Promise.all(
    cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

it("keeps compact and pretty ranges within the read-tool line count", async () => {
  const pretty = [
    "{",
    '  "server": {',
    '    "enabled": true',
    "  },",
    '  "other": true',
    "}",
  ].join("\n");
  const cases = [
    {
      name: "compact.json",
      source: '{"server":{"enabled":true},"other":true}',
      totalLines: 1,
      serverRange: [1, 1],
      otherLine: 1,
    },
    {
      name: "pretty-no-newline.json",
      source: pretty,
      totalLines: 6,
      serverRange: [2, 4],
      otherLine: 5,
    },
    {
      name: "pretty-trailing-newline.json",
      source: `${pretty}\n`,
      totalLines: 7,
      serverRange: [2, 4],
      otherLine: 5,
    },
  ] as const;

  const dir = await mkdtemp(join(tmpdir(), "json-line-count-"));
  cleanup.push(dir);

  for (const fixture of cases) {
    const filePath = join(dir, fixture.name);
    await writeFile(filePath, fixture.source, "utf8");
    const map = await jsonMapper(filePath);
    const server = map?.symbols.find((symbol) => symbol.name === "server");
    const other = map?.symbols.find((symbol) => symbol.name === "other");

    expect(map?.totalLines, fixture.name).toBe(fixture.totalLines);
    expect([server?.startLine, server?.endLine], fixture.name).toEqual(
      fixture.serverRange,
    );
    expect(other, fixture.name).toMatchObject({
      signature: "boolean",
      startLine: fixture.otherLine,
      endLine: fixture.otherLine,
    });
    expect(
      map?.symbols.every(
        (symbol) => symbol.startLine >= 1 && symbol.endLine <= fixture.totalLines,
      ),
      fixture.name,
    ).toBe(true);
  }
});
