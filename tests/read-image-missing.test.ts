import { expect, it, vi } from "vitest";

const delegated = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...await importOriginal<typeof import("@earendil-works/pi-coding-agent")>(),
  createReadTool: () => ({ execute: delegated.execute }),
}));
import { registerReadTool } from "../src/read.js";

it.each(["jpg", "jpeg", "png", "gif", "webp", "PNG"])(
  "codes delegated ENOENT for .%s without marking the read successful", async (extension) => {
    const path = "missing-image." + extension;
    delegated.execute.mockRejectedValueOnce(Object.assign(new Error("native access failure"), { code: "ENOENT" }));
    const onSuccessfulRead = vi.fn();
    const tool = registerReadTool({ registerTool() {} } as any, { onSuccessfulRead });
    const result: any = await tool.execute("missing", { path }, undefined, undefined, { cwd: process.cwd() } as any);
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: "File not found: " + path }]);
    expect(result.details.ptcValue).toMatchObject({
      tool: "read", ok: false, path,
      error: { code: "file-not-found", message: "File not found: " + path },
    });
    expect(onSuccessfulRead).not.toHaveBeenCalled();
  },
);

it.each(["EACCES", "EPERM", "ABORT_ERR", undefined])(
  "preserves non-ENOENT delegated exception identity (%s)", async (code) => {
    const error = Object.assign(new Error("delegated failure"), { code });
    delegated.execute.mockRejectedValueOnce(error);
    const onSuccessfulRead = vi.fn();
    const tool = registerReadTool({ registerTool() {} } as any, { onSuccessfulRead });
    await expect(tool.execute("missing", { path: "missing.png" }, undefined, undefined,
      { cwd: process.cwd() } as any)).rejects.toBe(error);
    expect(onSuccessfulRead).not.toHaveBeenCalled();
  },
);
