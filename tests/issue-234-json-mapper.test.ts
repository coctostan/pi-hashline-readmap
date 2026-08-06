import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import { jsonMapper } from "../src/readmap/mappers/json.js";

it("treats a symbol-less JSON extraction as a mapper miss", async () => {
  const dir = await mkdtemp(join(tmpdir(), "issue-234-json-"));
  const filePath = join(dir, "sample.json");

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
      const stdout = args[0] === "--version" ? "jq-1.8.1\n" : "{}\n";
      callback(null, { stdout, stderr: "" });
      return {};
    },
  );

  try {
    await writeFile(filePath, "{}\n", "utf8");

    await expect(jsonMapper(filePath)).resolves.toBeNull();
  } finally {
    execFileMock.mockReset();
    await rm(dir, { recursive: true, force: true });
  }
});
