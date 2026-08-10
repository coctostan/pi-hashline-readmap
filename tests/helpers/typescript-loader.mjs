import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.startsWith("file:") && specifier.endsWith(".js")) {
    const tsUrl = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
    try {
      await readFile(fileURLToPath(tsUrl));
      return { shortCircuit: true, url: tsUrl.href };
    } catch {
      // Let Node resolve the original JavaScript specifier.
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts")) {
    const source = await readFile(fileURLToPath(url), "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: fileURLToPath(url),
    });
    return {
      format: "module",
      shortCircuit: true,
      source: output.outputText,
    };
  }
  return nextLoad(url, context);
}
