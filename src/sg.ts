import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as cp from "node:child_process";

type SgParams = { pattern: string; lang?: string; path?: string };

function execFileText(
  cmd: string,
  args: string[],
  opts: cp.ExecFileOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    cp.execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) {
        (err as any).stdout = stdout;
        (err as any).stderr = stderr;
        reject(err);
      } else {
        resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
      }
    });
  });
}

export function registerSgTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "sg",
    label: "AST Grep",
    description: "Structural code search using ast-grep.",
    parameters: Type.Object({
      pattern: Type.String({ description: "AST pattern to search for" }),
      lang: Type.Optional(Type.String({ description: "Language hint for ast-grep (e.g. 'typescript')" })),
      path: Type.Optional(Type.String({ description: "Directory or file to search (default: cwd)" })),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const p = params as SgParams;
      const args = ["run", "--json", "-p", p.pattern, p.path ?? "."];

      try {
        const { stdout } = await execFileText("sg", args, {
          cwd: ctx.cwd,
          signal,
          maxBuffer: 10 * 1024 * 1024,
        });
        return { content: [{ type: "text", text: stdout }], details: {} };
      } catch (err: any) {
        if (err?.code === "ENOENT") {
          return {
            content: [{ type: "text", text: "ast-grep (sg) is not installed. Run: brew install ast-grep" }],
            isError: true,
            details: {},
          };
        }
        return {
          content: [{ type: "text", text: String(err?.stderr || err?.message || err) }],
          isError: true,
          details: {},
        };
      }
    },
  });
}
