// Another extension whose async tool_result handler runs before Hashline's: while a write is in
// flight, a read's result waits for the write's result, which then waits on I/O, so the read is
// recorded after the write ran but before the write's own result.
export default function slowToolResultExtension(pi: any): void {
  let writeResultStarted: Promise<void> | undefined;
  let release: (() => void) | undefined;
  pi.on("tool_call", (event: any) => {
    if (event.toolName !== "write") return undefined;
    writeResultStarted = new Promise<void>((resolve) => { release = resolve; });
    return undefined;
  });
  pi.on("tool_result", async (event: any) => {
    if (event.toolName === "read") await writeResultStarted;
    if (event.toolName === "write") {
      release?.();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return undefined;
  });
}
