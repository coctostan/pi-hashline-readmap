import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { it } from "vitest";
import { jsonOf, runProgram, supported } from "./helpers/codemode-recipes.js";
import { NUMERIC_HINTS } from "./helpers/tool-contract-pins.js";

it.skipIf(!supported).each(["read", "grep", "ast_search"])(
  "preserves %s numeric parameter hints in real codemode declarations", (tool) => {
    const declaration = jsonOf(runProgram({
      steps: [{code: 'text({declaration: await describeTool(' + JSON.stringify(tool) + ')});'}],
    })).declaration;
    const lines = declaration.split(/\r?\n/);
    const missing = NUMERIC_HINTS.filter(([name]) => name === tool).filter(([, param, hint]) => {
      const index = lines.findIndex((line: string) =>
        new RegExp("^\\s*" + param + "\\?\\s*:\\s*number\\s*\\|\\s*string\\s*;").test(line));
      return index < 1 || lines[index - 1].trim() !== "// " + hint;
    }).map(([, param]) => tool + "." + param);
    assert.deepEqual(missing, [], "numeric parameter hints absent from rendered declarations");
  }, 130_000,
);

it.skipIf(!supported)("documents find search-root resolution in registered guidance", () => {
  const declaration = jsonOf(runProgram({
    steps: [{code: 'text({find: await describeTool("find")});'}],
  })).find;
  const guidance = declaration.split("codemode tool declaration:")[0];
  assert.match(guidance.split(/\r?\n/)[0], /entries are relative to resolved search root/i,
    "find description must identify the resolved search root");
  assert.match(guidance, /resolved path \(default cwd\) before read\/edit/i);
  assert.match(guidance, /relative roots use cwd/i);
}, 130_000);

it.skipIf(!supported)("requires joining an external find root before reading returned entries", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-279-external-"));
  const basename = "pi-279-unique-fixture.txt";
  try {
    writeFileSync(join(root, basename), "outside cwd\n");
    const report = runProgram({ steps: [{ code: `
      const root = ${JSON.stringify(root)};
      const f = await tools.find({path: root, pattern: ${JSON.stringify(basename)}});
      const entry = f.entries[0].path;
      const unjoined = await tools.read({path: entry, errorMode: "value"});
      const joined = await tools.read({path: root + "/" + entry});
      const listing = await tools.ls({path: root});
      text({entry, truncated: f.truncated, unjoined, joinedRaw: joined.lines[0].raw,
        lsPath: listing.path, lsName: listing.entries[0].name});
    ` }] });
    const result = jsonOf(report);
    console.log("external-root reproduction:", JSON.stringify(result));
    assert.equal(result.entry, basename);
    assert.equal(result.truncated, false);
    assert.equal(result.unjoined.ok, false);
    assert.equal(result.unjoined.error.code, "file-not-found");
    assert.equal(result.joinedRaw, "outside cwd");
    assert.equal(result.lsName, basename);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 130_000);

it.skipIf(!supported)("codes missing external-root PNG reads while preserving joined images", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-279-external-png-"));
  const basename = "pi-279-unique-image.png";
  try {
    writeFileSync(join(root, basename), Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64"));
    const result = jsonOf(runProgram({ steps: [{ code: `
      const root = ${JSON.stringify(root)};
      const found = await tools.find({path: root, pattern: ${JSON.stringify(basename)}});
      const entry = found.entries[0].path;
      const unjoined = await tools.read({path: entry, errorMode: "value"});
      let defaultError = null;
      try { await tools.read({path: entry}); }
      catch (error) { defaultError = error.message; }
      const joined = await tools.read({path: root + "/" + entry});
      text({entry, unjoined, defaultError, imageType: joined.type,
        mimeType: joined.mimeType, hasData: joined.data.length > 0});
    ` }] }));
    assert.equal(result.entry, basename);
    assert.equal(result.unjoined.ok, false);
    assert.equal(result.unjoined.tool, "read");
    assert.equal(result.unjoined.error.code, "file-not-found");
    assert.equal(result.unjoined.error.message, "File not found: " + basename);
    assert.match(result.defaultError, /File not found:/);
    assert.equal(result.imageType, "image");
    assert.equal(result.mimeType, "image/png");
    assert.equal(result.hasData, true);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
}, 130_000);

it.skipIf(!supported)("retains read numeric-string execution equivalence", () => {
  const result = jsonOf(runProgram({
    files: {"numeric.ts": "export function target() { return 2; }\n"},
    steps: [{code: `
    const inputs = [{"path":"numeric.ts","offset":1},{"path":"numeric.ts","limit":1},{"path":"numeric.ts","offset":1,"charOffset":0},{"path":"numeric.ts","offset":1,"charLimit":8}];
    const keys = ["offset","limit","charOffset","charLimit"];
    const pairs = [];
    for (let i = 0; i < inputs.length; i++) {
      const numeric = await tools.read(inputs[i]);
      const strings = await tools.read({...inputs[i], [keys[i]]: String(inputs[i][keys[i]])});
      pairs.push({numeric, strings});
    }
    text({pairs});
  `}],
  }));
  assert.equal(result.pairs.length, 4);
  for (const pair of result.pairs) assert.deepEqual(pair.strings, pair.numeric);
}, 130_000);

it.skipIf(!supported)("retains grep numeric-string execution equivalence", () => {
  const result = jsonOf(runProgram({
    files: {"numeric.ts": "export function target() { return 2; }\n"},
    steps: [{code: `
    const inputs = [{"path":"numeric.ts","pattern":"target","context":0},{"path":"numeric.ts","pattern":"target","limit":1},{"path":"numeric.ts","pattern":"target","scope":"symbol","scopeContext":0}];
    const keys = ["context","limit","scopeContext"];
    const pairs = [];
    for (let i = 0; i < inputs.length; i++) {
      const numeric = await tools.grep(inputs[i]);
      const strings = await tools.grep({...inputs[i], [keys[i]]: String(inputs[i][keys[i]])});
      pairs.push({numeric, strings});
    }
    text({pairs});
  `}],
  }));
  assert.equal(result.pairs.length, 3);
  for (const pair of result.pairs) assert.deepEqual(pair.strings, pair.numeric);
}, 130_000);

it.skipIf(!supported)("retains ast_search numeric-string execution equivalence", () => {
  const result = jsonOf(runProgram({
    files: {"numeric.ts": "export function target() { return 2; }\n"},
    steps: [{code: `
    const inputs = [{"path":"numeric.ts","pattern":"return $A","lang":"typescript","limit":1}];
    const keys = ["limit"];
    const pairs = [];
    for (let i = 0; i < inputs.length; i++) {
      const numeric = await tools.ast_search(inputs[i]);
      const strings = await tools.ast_search({...inputs[i], [keys[i]]: String(inputs[i][keys[i]])});
      pairs.push({numeric, strings});
    }
    text({pairs});
  `}],
  }));
  assert.equal(result.pairs.length, 1);
  for (const pair of result.pairs) assert.deepEqual(pair.strings, pair.numeric);
}, 130_000);

it.skipIf(!supported)("documents find output resolution without changing root-relative paths", () => {
  const declaration = jsonOf(runProgram({
    steps: [{code: 'text({declaration: await describeTool("find")});'}],
  })).declaration;
  const output = declaration.slice(declaration.indexOf("): Promise<"));
  assert.match(output,
    /\/\/[^\n]*relative to resolved search root \(path, default cwd\); join to that root before read\/edit\.\s*\n\s*path\s*:\s*string\s*;/i,
    "find output entry path must carry a resolution comment");
}, 130_000);

it.skipIf(!supported)("retains find root-relative joined-read composition", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-279-find-output-"));
  try {
    writeFileSync(join(root, "pi-279-absolute.txt"), "absolute root\n");
    const result = jsonOf(runProgram({
      files: {
        "pi-279-cwd.txt": "omitted root\n",
        "nested/pi-279-relative.txt": "relative root\n",
      },
      steps: [{code: `
      const EXTERNAL_ROOT = ${JSON.stringify(root)};
      const cwd = (await tools.ls({})).path;
      const roots = [
        {label: "omitted", root: cwd, args: {pattern: "pi-279-cwd.txt"}},
        {label: "relative", root: cwd + "/nested", args: {path: "nested", pattern: "pi-279-relative.txt"}},
        {label: "absolute", root: EXTERNAL_ROOT, args: {path: EXTERNAL_ROOT, pattern: "pi-279-absolute.txt"}},
      ];
      const results = [];
      for (const scenario of roots) {
        const f = await tools.find(scenario.args);
        const entry = f.entries[0].path;
        const r = await tools.read({path: scenario.root + "/" + entry});
        results.push({label: scenario.label, entry, truncated: f.truncated, raw: r.lines[0].raw});
      }
      text({results});
    `}],
    }));
    assert.deepEqual(result.results, [
      {label: "omitted", entry: "pi-279-cwd.txt", truncated: false, raw: "omitted root"},
      {label: "relative", entry: "pi-279-relative.txt", truncated: false, raw: "relative root"},
      {label: "absolute", entry: "pi-279-absolute.txt", truncated: false, raw: "absolute root"},
    ]);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
}, 130_000);

it.skipIf(!supported)("retains find limit truncation", () => {
  const result = jsonOf(runProgram({
    files: {"bounded/a.txt": "a\n", "bounded/b.txt": "b\n"},
    steps: [{code: `
      const found = await tools.find({path: "bounded", pattern: "*.txt", limit: 1});
      text({length: found.entries.length, truncated: found.truncated});
    `}],
  }));
  assert.deepEqual(result, {length: 1, truncated: true});
}, 130_000);

it.skipIf(!supported)("documents ls basename resolution in registered guidance", () => {
  const declaration = jsonOf(runProgram({
    steps: [{code: 'text({ls: await describeTool("ls")});'}],
  })).ls;
  const guidance = declaration.split("codemode tool declaration:")[0];
  assert.match(guidance.split(/\r?\n/)[0], /entry names are basenames/i,
    "ls description must identify entry basenames");
  assert.match(guidance, /returned resolved path/i);
  assert.match(guidance, /Join ls result\.path with entries\[\]\.name before read\/edit/i);
}, 130_000);

it.skipIf(!supported)("documents ls output basenames with the resolved directory", () => {
  const declaration = jsonOf(runProgram({
    steps: [{code: 'text({declaration: await describeTool("ls")});'}],
  })).declaration;
  const output = declaration.slice(declaration.indexOf("): Promise<"));
  assert.match(output,
    /\/\/[^\n]*Entry basename; join to the returned path before read\/edit\.\s*\n\s*name\s*:\s*string\s*;/i,
    "ls output name must carry a basename resolution comment");
  assert.match(output,
    /\/\/[^\n]*Resolved absolute directory; join with entries\[\]\.name before read\/edit\.\s*\n\s*path\s*:\s*string\s*;/i,
    "ls output path must identify the resolved directory");
}, 130_000);

it.skipIf(!supported)("retains ls returned-directory joined-read composition", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-279-ls-output-"));
  try {
    writeFileSync(join(root, "pi-279-ls-absolute.txt"), "absolute listing\n");
    const result = jsonOf(runProgram({
      files: {
        "pi-279-ls-cwd.txt": "omitted listing\n",
        "nested/pi-279-ls-relative.txt": "relative listing\n",
      },
      steps: [{code: `
      const EXTERNAL_ROOT = ${JSON.stringify(root)};
      const cwd = (await tools.ls({})).path;
      const scenarios = [
        {label: "omitted", args: {glob: "pi-279-ls-cwd.txt"}, expectedPath: cwd},
        {label: "relative", args: {path: "./nested", glob: "pi-279-ls-relative.txt"}, expectedPath: cwd + "/nested"},
        {label: "absolute", args: {path: EXTERNAL_ROOT, glob: "pi-279-ls-absolute.txt"}, expectedPath: EXTERNAL_ROOT},
      ];
      const results = [];
      for (const scenario of scenarios) {
        const listing = await tools.ls(scenario.args);
        const name = listing.entries[0].name;
        const r = await tools.read({path: listing.path + "/" + name});
        results.push({label: scenario.label, name, resolved: listing.path === scenario.expectedPath,
          truncated: listing.truncated, raw: r.lines[0].raw});
      }
      text({results});
    `}],
    }));
    assert.deepEqual(result.results, [
      {label: "omitted", name: "pi-279-ls-cwd.txt", resolved: true, truncated: false, raw: "omitted listing"},
      {label: "relative", name: "pi-279-ls-relative.txt", resolved: true, truncated: false, raw: "relative listing"},
      {label: "absolute", name: "pi-279-ls-absolute.txt", resolved: true, truncated: false, raw: "absolute listing"},
    ]);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
}, 130_000);
