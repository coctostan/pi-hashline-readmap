import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Pi's extension loader maps the pi-ai root to this view (TypeBox `Type`, a `TUnsafe` `StringEnum`); tests see what loaded extensions see.
    alias: [{
      find: /^@earendil-works\/pi-ai$/,
      replacement: fileURLToPath(new URL("node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/pi-ai-extension-view.js", import.meta.url)),
    }],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000,
    setupFiles: ["tests/setup/no-persist-maps.ts", "tests/setup/key-hint-fixture.ts"],
  }
});
