import { describe, expect, it } from "vitest";
import { createJiti } from "jiti";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("map-cache singleton state under dual module instances", () => {
  it("shares cache state across extensionless and .js specifiers", async () => {
    const jiti = createJiti(import.meta.url, { moduleCache: false });
    const base = `${process.cwd()}/src/`;
    const extensionless = await jiti.import<any>(`${base}map-cache`);
    const withExtension = await jiti.import<any>(`${base}map-cache.js`);

    expect(extensionless).not.toBe(withExtension);
    expect(typeof extensionless.__getInMemoryMapCacheSizeForTest).toBe("function");
    expect(typeof withExtension.__getInMemoryMapCacheSizeForTest).toBe("function");

    const dir = mkdtempSync(join(tmpdir(), "map-cache-dual-"));
    try {
      const filePath = join(dir, "sample.ts");
      writeFileSync(filePath, "export function hello() { return 1; }\n", "utf8");

      extensionless.clearMapCache();
      expect(extensionless.__getInMemoryMapCacheSizeForTest()).toBe(0);
      expect(withExtension.__getInMemoryMapCacheSizeForTest()).toBe(0);

      await extensionless.getOrGenerateMap(filePath);

      expect(extensionless.__getInMemoryMapCacheSizeForTest()).toBe(1);
      expect(withExtension.__getInMemoryMapCacheSizeForTest()).toBe(1);

      withExtension.clearMapCache();

      expect(extensionless.__getInMemoryMapCacheSizeForTest()).toBe(0);
      expect(withExtension.__getInMemoryMapCacheSizeForTest()).toBe(0);

      await withExtension.getOrGenerateMap(filePath);

      expect(withExtension.__getInMemoryMapCacheSizeForTest()).toBe(1);
      expect(extensionless.__getInMemoryMapCacheSizeForTest()).toBe(1);

      extensionless.clearMapCache();

      expect(extensionless.__getInMemoryMapCacheSizeForTest()).toBe(0);
      expect(withExtension.__getInMemoryMapCacheSizeForTest()).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      extensionless.clearMapCache();
    }
  });
});
