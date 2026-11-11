import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildBundle } from "../scripts/build.mjs";
import { selectCompatHost } from "../scripts/pi-compat-host.mjs";

const { host } = selectCompatHost();
const repo = process.cwd();

type RpcEvent = { type: string; id?: string; command?: string; success?: boolean; method?: string; message?: string; notifyType?: string };

// The selected host's real CLI in RPC mode, model-free: session commands need no provider.
class RpcPi {
  readonly events: RpcEvent[] = [];
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly waiting = new Map<string, (event: RpcEvent) => void>();
  private nextId = 0;
  private stderr = "";

  constructor(entry: string, cwd: string, agentDir: string) {
    this.child = spawn(process.execPath, [join(host, "dist/cli.js"), "--mode", "rpc", "--no-extensions", "--no-session", "-e", entry], {
      cwd,
      env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
    });
    this.child.stderr.on("data", (chunk) => (this.stderr += chunk));
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      let event: RpcEvent;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      this.events.push(event);
      if (event.type === "response" && event.id) this.waiting.get(event.id)?.(event);
    });
  }

  send(command: Record<string, unknown>): Promise<RpcEvent> {
    const id = `t${this.nextId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no response to ${command.type}; stderr:\n${this.stderr}`)), 30_000);
      this.waiting.set(id, (event) => {
        clearTimeout(timer);
        resolve(event);
      });
      this.child.stdin.write(`${JSON.stringify({ ...command, id })}\n`);
    });
  }

  notices(): RpcEvent[] {
    return this.events.filter((event) => event.type === "extension_ui_request" && event.method === "notify");
  }

  stop(): void {
    this.child.kill();
  }
}

let scratch: string;
let checkout: string;
let pi: RpcPi | undefined;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "pi-stale-code-"));
  checkout = join(scratch, "checkout");
  for (const path of ["package.json", "index.ts", "src", "prompts", "scripts"]) cpSync(join(repo, path), join(checkout, path), { recursive: true });
  symlinkSync(join(repo, "node_modules"), join(checkout, "node_modules"), "dir");
  mkdirSync(join(scratch, "cwd"));
  mkdirSync(join(scratch, "agent"));
});

afterEach(() => {
  pi?.stop();
  pi = undefined;
  rmSync(scratch, { recursive: true, force: true });
});

async function start(entry = "index.ts"): Promise<RpcPi> {
  pi = new RpcPi(join(checkout, entry), join(scratch, "cwd"), join(scratch, "agent"));
  // A first answered command means startup, and its session_start, are done.
  expect((await pi.send({ type: "get_state" })).success).toBe(true);
  return pi;
}

function touch(path: string, secondsAhead: number): void {
  const now = new Date(Date.now() + secondsAhead * 1000);
  utimesSync(join(checkout, path), now, now);
}

describe("stale Hashline code on the selected host (source layout)", () => {
  it("warns once at new_session after a src/ or prompts/ file changed", async () => {
    const pi = await start();
    expect(pi.notices()).toEqual([]);
    touch("src/read.ts", 1);
    touch("prompts/read.md", 2);
    expect((await pi.send({ type: "new_session" })).success).toBe(true);
    const notices = pi.notices();
    expect(notices).toHaveLength(1);
    expect(notices[0].notifyType).toBe("warning");
    expect(notices[0].message).toMatch(/\b2 files\b/);
    expect(notices[0].message).toContain("prompts/read.md");
    expect(notices[0].message).toContain("/reload");
  }, 60_000);

  it("stays silent at startup and at new_session when nothing changed", async () => {
    const pi = await start();
    expect((await pi.send({ type: "new_session" })).success).toBe(true);
    expect(pi.notices()).toEqual([]);
  }, 60_000);
});

describe("stale Hashline code on the selected host (bundle layout)", () => {
  beforeEach(async () => {
    await buildBundle({ rootDir: checkout, outDir: join(checkout, "dist") });
  });

  it("warns once at new_session after dist/index.js or a prompts/ file changed", async () => {
    const pi = await start("dist/index.js");
    expect(pi.notices()).toEqual([]);
    touch("prompts/read.md", 1);
    touch("dist/index.js", 2);
    expect((await pi.send({ type: "new_session" })).success).toBe(true);
    const notices = pi.notices();
    expect(notices).toHaveLength(1);
    expect(notices[0].notifyType).toBe("warning");
    expect(notices[0].message).toMatch(/\b2 files\b/);
    expect(notices[0].message).toContain("dist/index.js");
    expect(notices[0].message).toContain("/reload");
  }, 60_000);

  it("stays silent at new_session when only a src/ file changed", async () => {
    const pi = await start("dist/index.js");
    touch("src/read.ts", 1);
    expect((await pi.send({ type: "new_session" })).success).toBe(true);
    expect(pi.notices()).toEqual([]);
  }, 60_000);
});
