import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import { clearMapCache } from "../src/map-cache.js";
import { SymbolKind } from "../src/readmap/enums.js";
import { jsonMapper } from "../src/readmap/mappers/json.js";

const JSON_SOURCE = [
  "{",
  '  "server": {',
  '    "host": "localhost",',
  '    "port": 8080',
  "  },",
  '  "features": {',
  '    "enabled": true',
  "  }",
  "}",
  "",
].join("\n");

function text(result: any): string {
  return result.content?.find((entry: any) => entry.type === "text")?.text ?? "";
}

async function callReadTool(params: { path: string; symbol: string }) {
  let capturedTool: any;
  const { registerReadTool } = await import("../src/read.js");
  registerReadTool({
    registerTool(tool: any) {
      capturedTool = tool;
    },
  } as any);
  return capturedTool.execute(
    "issue-237-repro",
    params,
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );
}

describe("issue 237: JSON symbols use source ranges", () => {
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
        let stdout: string;
        if (args[0] === "--version") {
          stdout = "jq-1.8.2\n";
        } else if (args[1]?.endsWith("package.json")) {
          stdout = '{"name":"string","dependencies":"{...}"}\n';
        } else {
          stdout = '{"server":"{...}","features":"{...}"}\n';
        }
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

  it("maps and reads the complete server object from its real source range", async () => {
    const dir = await mkdtemp(join(tmpdir(), "issue-237-json-"));
    cleanup.push(dir);
    const filePath = join(dir, "sample.json");
    await writeFile(filePath, JSON_SOURCE, "utf8");

    const map = await jsonMapper(filePath);
    expect(map?.symbols[0]).toMatchObject({
      name: "server",
      kind: SymbolKind.Property,
      signature: "{...}",
      startLine: 2,
      endLine: 5,
    });

    const result = await callReadTool({ path: filePath, symbol: "server" });
    const output = text(result);
    expect(output).toContain("[Symbol: server (property), lines 2-5 of 10]");
    expect(output).toContain('2:0d4|  "server": {');
    expect(output).toContain('4:08f|    "port": 8080');
    expect(output).toContain("5:2f6|  },");
    expect(output).not.toContain('6:ff2|  "features": {');
  });

  it("reads the real package.json dependencies block instead of an unrelated keyword line", async () => {
    const filePath = resolve(process.cwd(), "package.json");
    const lines = (await readFile(filePath, "utf8")).split("\n");
    const startLine = lines.indexOf('  "dependencies": {') + 1;
    const endLine =
      lines.findIndex((line, index) => index >= startLine && line.startsWith("  }")) + 1;
    expect(startLine).toBeGreaterThan(0);
    expect(endLine).toBeGreaterThan(startLine);

    const result = await callReadTool({ path: filePath, symbol: "dependencies" });
    const output = text(result);

    expect(output).toContain(
      `[Symbol: dependencies (property), lines ${startLine}-${endLine} of ${lines.length}]`,
    );
    expect(output).toContain('"xxhash-wasm"');
    expect(output).not.toContain('"ast-grep"');
  });
});
