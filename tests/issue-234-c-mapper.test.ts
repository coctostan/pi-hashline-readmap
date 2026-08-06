import { expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cMapper } from "../src/readmap/mappers/c.js";

it("treats a symbol-less C extraction as a mapper miss", async () => {
  const dir = await mkdtemp(join(tmpdir(), "issue-234-c-"));
  const filePath = join(dir, "sample.c");

  try {
    await writeFile(filePath, "// comment only\n", "utf8");
    await expect(cMapper(filePath)).resolves.toBeNull();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
