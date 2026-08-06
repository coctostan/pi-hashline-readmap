import { expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { replaceSymbol } from "../src/replace-symbol.js";
import { generateMapFromContent } from "../src/readmap/mapper.js";
import {
  typescriptMapper,
  typescriptMapperFromContent,
} from "../src/readmap/mappers/typescript.js";

it("reports symbol-less TypeScript disk and content extraction as a miss", async () => {
  const dir = await mkdtemp(join(tmpdir(), "issue-234-typescript-"));
  const filePath = join(dir, "sample.ts");
  const content = "// comment only\n";

  try {
    await writeFile(filePath, content, "utf8");

    await expect(typescriptMapper(filePath)).resolves.toBeNull();
    await expect(
      typescriptMapperFromContent("virtual.ts", content),
    ).resolves.toBeNull();
    await expect(
      generateMapFromContent("virtual.ts", content),
    ).resolves.toBeNull();

    await expect(
      replaceSymbol({
        filePath: "virtual.ts",
        content,
        symbol: "missing",
        newBody: "export function missing() {}",
      }),
    ).resolves.toEqual({
      type: "not-found",
      message: "[Warning: symbol 'missing' not found. Available symbols: ]",
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
