import { describe, it, expect } from "vitest";

const modules = [
  "../src/readmap/mappers/python.js",
  "../src/readmap/mappers/go.js",
  "../src/readmap/mappers/gdscript.js",
  "../src/readmap/mappers/typescript.js",
  "../src/readmap/mappers/markdown.js",
  "../src/readmap/mappers/rust.js",
  "../src/readmap/mappers/cpp.js",
  "../src/readmap/mappers/sql.js",
  "../src/readmap/mappers/json.js",
  "../src/readmap/mappers/jsonl.js",
  "../src/readmap/mappers/c.js",
  "../src/readmap/mappers/yaml.js",
  "../src/readmap/mappers/toml.js",
  "../src/readmap/mappers/csv.js",
  "../src/readmap/mappers/swift.js",
  "../src/readmap/mappers/shell.js",
  "../src/readmap/mappers/fallback.js",
  "../src/readmap/mappers/ctags.js",
];

describe("mapper MAPPER_VERSION exports", () => {
  for (const mod of modules) {
    it(`${mod} exports MAPPER_VERSION as a positive integer`, async () => {
      const m = (await import(mod)) as { MAPPER_VERSION?: unknown };
      expect(typeof m.MAPPER_VERSION).toBe("number");
      expect(Number.isInteger(m.MAPPER_VERSION)).toBe(true);
      expect(m.MAPPER_VERSION as number).toBeGreaterThanOrEqual(1);
    });
  }
});
