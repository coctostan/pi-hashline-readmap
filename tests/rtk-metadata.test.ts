import { describe, it, expect, vi } from "vitest";
import { filterBashOutput } from "../src/rtk/bash-filter.js";
import * as gitModule from "../src/rtk/git.js";
import * as linterModule from "../src/rtk/linter.js";
import * as buildModule from "../src/rtk/build.js";
import * as buildToolsModule from "../src/rtk/build-tools.js";
import * as pkgMgrModule from "../src/rtk/package-manager.js";
import * as dockerModule from "../src/rtk/docker.js";
import * as fileListingModule from "../src/rtk/file-listing.js";
import * as httpClientModule from "../src/rtk/http-client.js";
import * as transferModule from "../src/rtk/transfer.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { gitLog } from "./helpers/git-log-fixture.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

async function loadHandlers(tag: string) {
  const modUrl = pathToFileURL(resolve(root, "index.ts")).href + "?t=" + tag + "-" + Date.now();
  const handlers: Record<string, Function> = {};
  const mockPi = {
    registerTool() {},
    on(event: string, handler: Function) {
      handlers[event] = handler;
    },
    events: { emit() {}, on() {} },
  };
  const mod = await import(modUrl);
  mod.default(mockPi as any);
  return handlers;
}

describe("filterBashOutput info (empty-input fast path)", () => {
  it("returns info with technique 'none', zero bytes, and ratio 1 on empty input", () => {
    const result = filterBashOutput("echo hello", "");
    expect(result).toEqual({
      output: "",
      savedChars: 0,
      compacted: false,
      dropped: [],
      info: {
        originalBytes: 0,
        outputBytes: 0,
        compressionRatio: 1,
        technique: "none",
      },
    });
    expect(result.info.bypassedBy).toBeUndefined();
  });
});

describe("filterBashOutput info (byte-length metric)", () => {
  it("uses Buffer.byteLength(..., 'utf8'), not char count, and computes ratio from bytes", () => {
    // 4 multibyte glyphs: each "🌟" is a non-BMP codepoint stored as a UTF-16 surrogate pair (length 2) / 4 UTF-8 bytes; each "é" is 1 UTF-16 code unit / 2 UTF-8 bytes.
    const raw = "🌟🌟 é é"; // UTF-16 code units: 2+2+1+1+1+1 = 8; UTF-8 bytes: 4+4+1+2+1+2 = 14
    // JS `.length` reports UTF-16 code units, not user-perceived characters.
    expect(raw.length).toBe(8);
    expect(Buffer.byteLength(raw, "utf8")).toBe(14);

    const result = filterBashOutput("echo multibyte", raw);
    // Unknown command → stripAnsi passthrough, result.output === raw
    expect(result.output).toBe(raw);
    expect(result.info.originalBytes).toBe(14);
    expect(result.info.outputBytes).toBe(14);
    expect(result.info.compressionRatio).toBe(1);
    expect(result.info.technique).toBe("none");
  });
});


describe("filterBashOutput info (test-command short-circuit)", () => {
  it("tags info.technique === 'test-output' and leaves bypassedBy unset for test commands", () => {
    const raw = "\x1b[32mPASS\x1b[0m src/foo.test.ts\n";
    const result = filterBashOutput("npm test", raw);
    expect(result.output).toBe("PASS src/foo.test.ts\n");
    expect(result.info.technique).toBe("test-output");
    expect(result.info.bypassedBy).toBeUndefined();
    expect(result.info.originalBytes).toBe(Buffer.byteLength(raw, "utf8"));
    expect(result.info.outputBytes).toBe(Buffer.byteLength("PASS src/foo.test.ts\n", "utf8"));
  });
});


describe("filterBashOutput info (router technique tagging)", () => {
  const cases: Array<{ technique: string; command: string; mock: () => () => void }> = [
    {
      technique: "git",
      command: "git diff",
      mock: () => {
        const s = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue("G");
        return () => s.mockRestore();
      },
    },
    {
      technique: "linter",
      command: "eslint .",
      mock: () => {
        const s = vi.spyOn(linterModule, "aggregateLinterOutput").mockReturnValue("L");
        return () => s.mockRestore();
      },
    },
    {
      technique: "build-tools",
      command: "cargo clippy",
      mock: () => {
        const iS = vi.spyOn(buildToolsModule, "isBuildToolsCommand").mockReturnValue(true);
        const s = vi.spyOn(buildToolsModule, "compressBuildToolsOutput").mockReturnValue("BT");
        return () => {
          iS.mockRestore();
          s.mockRestore();
        };
      },
    },
    {
      technique: "build",
      command: "tsc",
      mock: () => {
        const s = vi.spyOn(buildModule, "filterBuildOutput").mockReturnValue("B");
        return () => s.mockRestore();
      },
    },
    {
      technique: "package-manager",
      command: "npm install",
      mock: () => {
        const iS = vi.spyOn(pkgMgrModule, "isPackageManagerCommand").mockReturnValue(true);
        const s = vi.spyOn(pkgMgrModule, "compressPackageManagerOutput").mockReturnValue("PM");
        return () => {
          iS.mockRestore();
          s.mockRestore();
        };
      },
    },
    {
      technique: "docker",
      command: "docker ps",
      mock: () => {
        const iS = vi.spyOn(dockerModule, "isDockerCommand").mockReturnValue(true);
        const s = vi.spyOn(dockerModule, "compressDockerOutput").mockReturnValue("D");
        return () => {
          iS.mockRestore();
          s.mockRestore();
        };
      },
    },
    {
      technique: "file-listing",
      command: "ls -la",
      mock: () => {
        const iS = vi.spyOn(fileListingModule, "isFileListingCommand").mockReturnValue(true);
        const s = vi.spyOn(fileListingModule, "compressFileListingOutput").mockReturnValue("FL");
        return () => {
          iS.mockRestore();
          s.mockRestore();
        };
      },
    },
    {
      technique: "http-client",
      command: "curl https://example.com",
      mock: () => {
        const iS = vi.spyOn(httpClientModule, "isHttpCommand").mockReturnValue(true);
        const s = vi.spyOn(httpClientModule, "compressHttpOutput").mockReturnValue("H");
        return () => {
          iS.mockRestore();
          s.mockRestore();
        };
      },
    },
    {
      technique: "transfer",
      command: "rsync -av a b",
      mock: () => {
        const iS = vi.spyOn(transferModule, "isTransferCommand").mockReturnValue(true);
        const s = vi.spyOn(transferModule, "compressTransferOutput").mockReturnValue("T");
        return () => {
          iS.mockRestore();
          s.mockRestore();
        };
      },
    },
  ];

  it.each(cases)("tags info.technique === '$technique' when that route fires", ({ technique, command, mock }) => {
    const restore = mock();
    try {
      const r = filterBashOutput(command, "raw\n");
      expect(r.info.technique).toBe(technique);
    } finally {
      restore();
    }
  });

  it("leaves info.technique === 'none' when no route matches", () => {
    const r = filterBashOutput("echo plain", "raw line\n");
    expect(r.info.technique).toBe("none");
  });

  it("leaves info.technique === 'none' when matching routes all return null", () => {
    const s = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue(null);
    try {
      const r = filterBashOutput("git status", "raw\n");
      expect(r.info.technique).toBe("none");
    } finally {
      s.mockRestore();
    }
  });
});


describe("filterBashOutput info (route throw fallback)", () => {
  it("tags info.technique === 'none' and returns stripAnsi(output) when a route throws", () => {
    const s = vi.spyOn(gitModule, "compactGitOutput").mockImplementation(() => {
      throw new Error("boom");
    });
    try {
      const raw = "\x1b[31mraw git\x1b[0m\n";
      const r = filterBashOutput("git log", raw);
      expect(r.output).toBe("raw git\n");
      expect(r.info.technique).toBe("none");
    } finally {
      s.mockRestore();
    }
  });
});


describe("RTK notice prepended on a compaction", () => {
  it("prepends [RTK: ...] naming the bypass command", async () => {
    const handlers = await loadHandlers("notice-on");
    const raw = "x".repeat(8400);
    const spy = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue("tiny compressed");
    try {
      const result = await handlers["tool_result"]({
        type: "tool_result",
        toolName: "bash",
        toolCallId: "n-1",
        input: { command: "git diff" },
        content: [{ type: "text", text: raw }],
        isError: false,
      });
      const text = result.content[0].text as string;
      expect(text.startsWith("[RTK: compressed git output ")).toBe(true);
      expect(text).toMatch(/Original output: \S+\. Use `PI_RTK_BYPASS=1 git diff` to re-run uncompressed\.\]/);
      expect(text).toContain("tiny compressed");
    } finally {
      spy.mockRestore();
    }
  });
});


describe("RTK notice format", () => {
  it("renders KB with one decimal place and rounded percentage", async () => {
    const handlers = await loadHandlers("notice-fmt");
    const raw = "x".repeat(8400); // 8400 B = 8.203125 KB → "8.2 KB"
    const spy = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue("y".repeat(1200)); // 1200 B = "1.2 KB"
    try {
      const result = await handlers["tool_result"]({
        type: "tool_result",
        toolName: "bash",
        toolCallId: "n-fmt",
        input: { command: "git diff" },
        content: [{ type: "text", text: raw }],
        isError: false,
      });
      const text = result.content[0].text as string;
      // 1200 / 8400 ≈ 0.1429 → saved ≈ 86% (Math.round((1 - 0.1429) * 100) = 86)
      expect(anyPath(text).startsWith("[RTK: compressed git output 8.2 KB → 1.2 KB (86% saved). Original output: <path>. Use `PI_RTK_BYPASS=1 git diff` to re-run uncompressed.]\n")).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("renders bytes (no KB suffix) when under 1024", async () => {
    const handlers = await loadHandlers("notice-bytes");
    const raw = "x".repeat(2100);
    const spy = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue("z".repeat(512));
    try {
      const result = await handlers["tool_result"]({
        type: "tool_result",
        toolName: "bash",
        toolCallId: "n-bytes",
        input: { command: "git diff" },
        content: [{ type: "text", text: raw }],
        isError: false,
      });
      const text = result.content[0].text as string;
      // original 2100 B = 2.1 KB; output 512 B → "512 B"
      expect(text.startsWith("[RTK: compressed git output 2.1 KB → 512 B (")).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});


async function runBash(tag: string, command: string, raw: string): Promise<string> {
  const handlers = await loadHandlers(tag);
  const result = await handlers["tool_result"]({
    type: "tool_result",
    toolName: "bash",
    toolCallId: tag,
    input: { command },
    content: [{ type: "text", text: raw }],
    isError: false,
  });
  return result.content[0].text as string;
}

// The saved original's path is random; the notice's shape is what these tests pin.
function anyPath(text: string): string {
  return text.replace(/Original output: \S+\. Use/, "Original output: <path>. Use");
}

describe("RTK notice on every compaction, whatever its size and ratio", () => {
  it("prepends the notice at an original of 2000 B", async () => {
    const spy = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue("tiny");
    try {
      const text = await runBash("any-size", "git diff", "x".repeat(2000));
      expect(anyPath(text)).toBe("[RTK: compressed git output 2.0 KB → 4 B (100% saved). Original output: <path>. Use `PI_RTK_BYPASS=1 git diff` to re-run uncompressed.]\ntiny");
    } finally {
      spy.mockRestore();
    }
  });

  it("prepends the notice at a ratio of 0.5", async () => {
    const half = "y".repeat(1500);
    const spy = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue(half);
    try {
      const text = await runBash("any-ratio", "git diff", "x".repeat(3000));
      expect(anyPath(text)).toBe(`[RTK: compressed git output 2.9 KB → 1.5 KB (50% saved). Original output: <path>. Use \`PI_RTK_BYPASS=1 git diff\` to re-run uncompressed.]\n${half}`);
    } finally {
      spy.mockRestore();
    }
  });

  it("prepends the notice to a small real git compaction", async () => {
    const text = await runBash("real-git", "git log -21", gitLog(21));
    expect(text.startsWith("[RTK: compressed git output ")).toBe(true);
    expect(text.split("\n")[0]).toMatch(/ Original output: \S+\. Use `PI_RTK_BYPASS=1 git log -21` to re-run uncompressed\.\]$/);
    expect(text).toMatch(/\n\.\.\. and 1 more commits$/);
  });
});

describe("RTK notice absent when no compactor changed the output", () => {
  it("omits notice when output is empty", async () => {
    expect(await runBash("none-empty", "echo hi", "")).toBe("");
  });

  it("omits notice when a route returns its input unchanged", async () => {
    const spy = vi.spyOn(gitModule, "compactGitOutput").mockImplementation((s: string) => s);
    try {
      expect(await runBash("none-same", "git diff", "\x1b[31m-a\x1b[0m\n+b\n")).toBe("-a\n+b\n");
    } finally {
      spy.mockRestore();
    }
  });

  it("omits notice on an ANSI-strip-only test-output result", async () => {
    expect(await runBash("none-test", "npm test", "\x1b[32mPASS\x1b[0m src/foo.test.ts\n")).toBe("PASS src/foo.test.ts\n");
  });

  it("omits notice when only the anti-pattern hint was added", async () => {
    const text = await runBash("none-hint", "find src -name '*.ts'", "src/a.ts\nsrc/b.ts\n");
    expect(text).toBe("src/a.ts\nsrc/b.ts\n\n\n[Hint: Prefer the dedicated file-search tools for repository discovery.]");
  });
});


describe("RTK notice absent under bypass", () => {
  it("does not prepend a notice when PI_RTK_BYPASS=1 is set, even on output a compactor would shrink", async () => {
    const spy = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue("tiny");
    const handlers = await loadHandlers("bypass-notice");
    try {
      const result = await handlers["tool_result"]({
        type: "tool_result",
        toolName: "bash",
        toolCallId: "bp-1",
        input: { command: "PI_RTK_BYPASS=1 git diff" },
        content: [{ type: "text", text: "x".repeat(8400) }],
        isError: false,
      });
      expect(result.content[0].text).toBe("x".repeat(8400));
      expect(result.details.compressionInfo.bypassedBy).toBe("env-var");
    } finally {
      spy.mockRestore();
    }
  });
});


describe("RTK notice composes with doom-loop prefix", () => {
  it("doom-loop → RTK notice → output, in that order", async () => {
    const handlers = await loadHandlers("compose");
    const raw = "x".repeat(8400);
    const spy = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue("tiny");
    const command = "git diff";
    try {
      for (const id of ["c-1", "c-2", "c-3"]) {
        await handlers["tool_call"]({ type: "tool_call", toolName: "bash", toolCallId: id, input: { command } });
      }
      const result = await handlers["tool_result"]({
        type: "tool_result",
        toolName: "bash",
        toolCallId: "c-3",
        input: { command },
        content: [{ type: "text", text: raw }],
        isError: false,
      });
      const text = result.content[0].text as string;
      const doomIdx = text.indexOf("⚠ REPEATED-CALL WARNING");
      const rtkIdx = text.indexOf("[RTK: compressed git output ");
      const bodyIdx = text.indexOf("\ntiny");
      expect(doomIdx).toBe(0);
      expect(rtkIdx).toBeGreaterThan(doomIdx);
      expect(bodyIdx).toBeGreaterThan(rtkIdx);
    } finally {
      spy.mockRestore();
    }
  });
});