import { expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pythonMapper } from "../src/readmap/mappers/python.js";

it("treats a symbol-less Python extraction as a mapper miss", async () => {
  const dir = await mkdtemp(join(tmpdir(), "issue-234-python-"));
  const filePath = join(dir, "sample.py");

  try {
    await writeFile(filePath, "# comment only\n", "utf8");

    await expect(pythonMapper(filePath)).resolves.toBeNull();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
