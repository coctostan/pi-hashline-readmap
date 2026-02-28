import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerReadTool } from "./src/read.js";
import { registerEditTool } from "./src/edit.js";
import { registerGrepTool } from "./src/grep.js";
import { registerSgTool } from "./src/sg.js";
export default function piHashlineReadmapExtension(pi: ExtensionAPI): void {
  registerReadTool(pi);
  registerEditTool(pi);
  registerGrepTool(pi);
  registerSgTool(pi);
}