import { realpathSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { selectCompatHost } from "./pi-compat-host.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { host, version } = selectCompatHost();
const selectedModules = realpathSync(resolve(host, "../.."));
const selectedContainingFile = join(host, "__pi_typecheck__.ts");
const config = ts.readConfigFile(join(root, "tsconfig.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const compiler = ts.createCompilerHost(parsed.options);
compiler.resolveModuleNames = (names, containingFile) => names.map(name =>
  ts.resolveModuleName(
    name,
    name.startsWith("@earendil-works/") || name === "typebox" ? selectedContainingFile : containingFile,
    parsed.options,
    compiler,
  ).resolvedModule,
);
const extensionFiles = parsed.fileNames.filter(path =>
  path === join(root, "index.ts") || path.startsWith(join(root, "src") + sep),
);
const fixture = join(root, "scripts/fixtures/pi-current-host-contracts.ts");
const extraFiles = process.argv.slice(2).map(path => resolve(root, path));
const program = ts.createProgram({
  rootNames: [...extensionFiles, fixture, ...extraFiles],
  options: parsed.options,
  host: compiler,
});
const declarations = {};
for (const name of ["pi-coding-agent", "pi-agent-core", "pi-ai", "pi-tui"]) {
  const specifier = "@earendil-works/" + name;
  const module = ts.resolveModuleName(specifier, selectedContainingFile, parsed.options, compiler).resolvedModule;
  if (!module) throw new Error("Selected declaration missing: " + specifier);
  const file = realpathSync(module.resolvedFileName);
  if (!file.startsWith(selectedModules + sep)) throw new Error("Declaration escaped selected host: " + file);
  declarations[specifier] = file;
}
for (const source of program.getSourceFiles()) {
  if (/[\\/]node_modules[\\/]@earendil-works[\\/]/.test(source.fileName)) {
    const file = realpathSync(source.fileName);
    if (!file.startsWith(selectedModules + sep)) throw new Error("Pi declaration fell back to locked host: " + file);
  }
}
for (const name of ["pi-coding-agent", "pi-agent-core", "pi-ai", "pi-tui",
  "pi-mcp", "pi-codemode", "pi-telemetry"]) {
  const manifest = JSON.parse(readFileSync(join(selectedModules, "@earendil-works", name, "package.json"), "utf8"));
  if (manifest.version !== version) throw new Error("Selected Pi graph version mismatch: " + name);
}
const diagnostics = [
  ...(config.error ? [config.error] : []),
  ...parsed.errors,
  ...ts.getPreEmitDiagnostics(program),
];
if (diagnostics.length > 0) {
  process.stderr.write(ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: path => path,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ host, version, declarations, extensionFiles, diagnostics: 0 }));
}
