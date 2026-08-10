import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cMapper } from "../src/readmap/mappers/c.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_RSS_GROWTH = 50 * 1024 * 1024;
const WARMUP = 25;
const MEASURED = 250;

describe("C WASM parse-loop soak", () => {
  it("keeps measured RSS growth within 50 MB", async () => {
    expect(MAX_RSS_GROWTH).toBe(50 * 1024 * 1024);
    const fixture = resolve(__dirname, "fixtures/wasm-c-representative.c");
    for (let i = 0; i < WARMUP; i += 1) {
      expect(await cMapper(fixture)).not.toBeNull();
    }
    const postWarmupRss = process.memoryUsage().rss;
    for (let i = 0; i < MEASURED; i += 1) {
      expect(await cMapper(fixture)).not.toBeNull();
    }
    const finalRss = process.memoryUsage().rss;
    expect(finalRss - postWarmupRss).toBeLessThanOrEqual(MAX_RSS_GROWTH);
  });
});
