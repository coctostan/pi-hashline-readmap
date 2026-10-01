import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000,
    setupFiles: ["tests/setup/no-persist-maps.ts", "tests/setup/key-hint-fixture.ts"],
  }
});
