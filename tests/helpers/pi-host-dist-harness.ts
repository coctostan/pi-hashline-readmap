import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Exact Pi release the independent current-host lane pins (see .github/workflows/pi-compatibility.yml). */
export const PI_COMPAT_VERSION = "1.1.0";

export type DistScenario = "fallback" | "built" | "negative" | "extracted";

export function selectedHost(): string {
  const lockedHost = resolve(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "..");
  return process.env.PI_COMPAT_HOST ? resolve(process.env.PI_COMPAT_HOST) : lockedHost;
}

export function runDistScenario(scenario: DistScenario, extraEnv: Record<string, string> = {}): string {
  return execFileSync(process.execPath, ["--input-type=module", "-e", SCRIPT], {
    cwd: process.cwd(),
    env: { ...process.env, PI_TEST_HOST: selectedHost(), PI_TEST_SCENARIO: scenario, ...extraEnv },
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

// NOTE: no template-literal interpolation inside this script; it is plain ESM run by `node -e`.
const SCRIPT = String.raw`
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const host = process.env.PI_TEST_HOST;
const scenario = process.env.PI_TEST_SCENARIO;
const repo = process.cwd();
const version = JSON.parse(readFileSync(join(host, "package.json"), "utf8")).version;
const { discoverAndLoadExtensions } = await import(pathToFileURL(join(host, "dist/index.js")));
const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
const root = mkdtempSync(join(tmpdir(), "pi-dist-host-"));
const cwd = join(root, "cwd");
const agentDir = join(root, "agent");
mkdirSync(cwd);
mkdirSync(agentDir);

// An installed extension tree has the runtime dependencies but neither Pi's peers nor typebox:
// those must come from the host through its resolver alias map.
function installDependencies(pkgDir) {
  for (const name of [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})]) {
    const source = join(repo, "node_modules", name);
    if (!existsSync(source)) continue;
    const target = join(pkgDir, "node_modules", name);
    if (existsSync(target)) continue;
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(source, target, "dir");
  }
}
function newPackage(name) {
  const pkgDir = join(root, name);
  mkdirSync(pkgDir);
  writeFileSync(
    join(pkgDir, "package.json"),
    JSON.stringify({ name: pkg.name, version: pkg.version, type: "module", pi: { extensions: ["./dist/index.js"] } }),
  );
  installDependencies(pkgDir);
  for (const dir of ["prompts", "scripts"]) symlinkSync(join(repo, dir), join(pkgDir, dir), "dir");
  return pkgDir;
}
function sourcePackage(name) {
  const pkgDir = newPackage(name);
  symlinkSync(join(repo, "index.ts"), join(pkgDir, "index.ts"));
  symlinkSync(join(repo, "src"), join(pkgDir, "src"), "dir");
  return pkgDir;
}
async function load(pkgDir) {
  return discoverAndLoadExtensions([pkgDir], cwd, agentDir);
}
function toolNames(extension) {
  return [...extension.tools.keys()].sort();
}
async function buildInto(pkgDir) {
  const { buildBundle } = await import(pathToFileURL(join(repo, "scripts/build.mjs")));
  await buildBundle({ outDir: join(pkgDir, "dist") });
}

try {
  if (scenario === "fallback") {
    const pkgDir = sourcePackage("fallback");
    assert.equal(existsSync(join(pkgDir, "dist")), false, "fallback scenario must have no dist/");
    const loaded = await load(pkgDir);
    assert.deepEqual(loaded.errors, []);
    assert.equal(loaded.extensions.length, 1);
    const extension = loaded.extensions[0];
    assert.equal(resolve(extension.resolvedPath), join(pkgDir, "index.ts"), "must fall back to index.ts");
    for (const tool of ["read", "edit", "grep", "write", "ls", "find", "bash"]) {
      assert.ok(extension.tools.has(tool), tool + " must register");
    }
  } else if (scenario === "built") {
    const sourceLoaded = await load(sourcePackage("source"));
    assert.deepEqual(sourceLoaded.errors, []);
    const pkgDir = newPackage("built");
    await buildInto(pkgDir);
    assert.deepEqual(JSON.parse(readFileSync(join(pkgDir, "dist/package.json"), "utf8")), { type: "commonjs" });
    const loaded = await load(pkgDir);
    assert.deepEqual(loaded.errors, []);
    assert.equal(loaded.extensions.length, 1);
    const extension = loaded.extensions[0];
    assert.equal(resolve(extension.resolvedPath), join(pkgDir, "dist/index.js"), "manifest must select the bundle");
    assert.deepEqual(toolNames(extension), toolNames(sourceLoaded.extensions[0]), "bundle must register the same tools as index.ts");
    for (const event of ["tool_call", "tool_result", "context"]) {
      assert.ok(extension.handlers.get(event)?.length, event + " must register");
    }
  } else if (scenario === "negative") {
    // The extension tree has neither Pi peers nor typebox, so the bundle can only run through the
    // host's jiti transform + alias map. Outside that path every typing variant must fail.
    for (const variant of ["commonjs-typed", "module-typed", "untyped"]) {
      const pkgDir = newPackage("negative-" + variant);
      await buildInto(pkgDir);
      if (variant === "module-typed") writeFileSync(join(pkgDir, "dist/package.json"), '{"type":"module"}\n');
      if (variant === "untyped") rmSync(join(pkgDir, "dist/package.json"));
      let nativeError;
      try {
        await import(pathToFileURL(join(pkgDir, "dist/index.js")).href);
      } catch (error) {
        nativeError = error;
      }
      assert.ok(nativeError, variant + ": a native import outside the host loader must fail");
      if (variant === "commonjs-typed") {
        // The shipped typing makes any native attempt fail fast instead of resolving peers elsewhere.
        assert.match(String(nativeError), /Cannot use import statement outside a module/);
      } else {
        assert.equal(nativeError.code, "ERR_MODULE_NOT_FOUND", variant + ": " + nativeError);
        assert.match(nativeError.message, /@earendil-works\/|typebox/, variant + ": peers must be missing natively");
      }
      // Recorded, not asserted: whether this host's loader also accepts the non-shipped typings.
      const loaded = await load(pkgDir);
      const ok = loaded.errors.length === 0 && loaded.extensions.length === 1;
      console.log("observed " + variant + " host-load=" + (ok ? "ok" : "fail"));
      if (variant === "commonjs-typed") assert.ok(ok, "the shipped commonjs typing must load through the host");
    }
  } else if (scenario === "extracted") {
    const pkgDir = process.env.PI_TEST_PKG_DIR;
    installDependencies(pkgDir);
    const loaded = await load(pkgDir);
    assert.deepEqual(loaded.errors, []);
    assert.equal(loaded.extensions.length, 1);
    const extension = loaded.extensions[0];
    assert.equal(resolve(extension.resolvedPath), join(pkgDir, "dist/index.js"));
    // Registration reads every prompt file from the package root, so a successful load proves them.
    assert.ok(extension.tools.has("read"));
    if (process.env.PI_TEST_RUN_PY_MAP === "1") {
      const file = join(cwd, "sample.py");
      writeFileSync(file, "def greet():\n    return 1\n");
      const result = await extension.tools.get("read").definition.execute("t", { path: file, map: true }, undefined, undefined, { cwd });
      assert.ok(!result.isError, "read with map must succeed");
      assert.ok(
        existsSync(join(pkgDir, "scripts/ran.marker")),
        "the python outline script must be resolved and run from the extracted package root",
      );
    }
  } else {
    throw new Error("scenario not implemented: " + scenario);
  }
  console.log("host-version=" + version + "; scenario=" + scenario + "=PASS");
} finally {
  rmSync(root, { recursive: true, force: true });
}
`;
