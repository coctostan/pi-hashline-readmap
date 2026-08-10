import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_RSS_GROWTH = 50 * 1024 * 1024;

describe("Swift WASM parse-loop soak", () => {
  it("keeps measured RSS growth within 50 MB", () => {
    const runner = resolve(__dirname, "helpers/swift-soak-child.mjs");
    const loader = resolve(__dirname, "helpers/typescript-loader.mjs");
    // Isolate RSS from Vitest's parallel workers. Liftoff-only excludes V8's
    // asynchronous WASM tier-up code from the parser lifecycle measurement.
    const child = spawnSync(
      process.execPath,
      ["--no-warnings", "--liftoff-only", "--experimental-loader", loader, runner],
      {
        cwd: resolve(__dirname, ".."),
        encoding: "utf8",
      },
    );
    expect(child.status, child.stderr || child.stdout).toBe(0);
    expect(child.stdout).not.toBe("");
    const result = JSON.parse(child.stdout) as {
      warmup: number;
      measured: number;
      growth: number;
      limit: number;
    };

    expect(result).toMatchObject({
      warmup: 25,
      measured: 250,
      limit: MAX_RSS_GROWTH,
    });
    expect(result.growth).toBeLessThanOrEqual(MAX_RSS_GROWTH);
  });
});
