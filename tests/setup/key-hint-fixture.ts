import { vi } from "vitest";

// Legacy identity-theme renderer fixtures isolate content/count contracts.
// Real host-hint tests must vi.unmock this module, initialize Pi's theme,
// and control the host's actual keybinding singleton explicitly.
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return {
    ...actual,
    keyHint: (_binding: string, description: string) => `Ctrl+O ${description}`,
    keyText: (_binding: string) => "Ctrl+O",
  };
});
