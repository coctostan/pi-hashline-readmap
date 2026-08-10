import { resolve } from "node:path";
import { swiftMapper } from "../../src/readmap/mappers/swift.ts";

const MAX_RSS_GROWTH = 50 * 1024 * 1024;
const WARMUP = 25;
const MEASURED = 250;
const fixture = resolve("tests/fixtures/wasm-swift-representative.swift");

for (let i = 0; i < WARMUP; i += 1) {
  if (!(await swiftMapper(fixture))) throw new Error(`warmup parse ${i} missed`);
}

const postWarmupRss = process.memoryUsage().rss;
for (let i = 0; i < MEASURED; i += 1) {
  if (!(await swiftMapper(fixture))) throw new Error(`measured parse ${i} missed`);
}
const growth = process.memoryUsage().rss - postWarmupRss;

process.stdout.write(
  JSON.stringify({
    warmup: WARMUP,
    measured: MEASURED,
    growth,
    limit: MAX_RSS_GROWTH,
  }),
);
if (growth > MAX_RSS_GROWTH) process.exitCode = 1;
