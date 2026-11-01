# Codemode recipes

Use Hashline's structured values to do work privately, then print only the fields needed for the next decision. Do not print a whole result containing both rendered text and equivalent source records. Keep relevant warnings, continuation cursors and search completeness in the projected summary.

[Result contracts](structured-output.md#codemode-integration) · [Back to README](../README.md)

## Enable without replacing your selection

On Pi 1.1, enable codemode for one invocation:

~~~bash
pi --tools +codemode
~~~

For persistent enablement, add codemode to your existing tool selection using the additive form:

~~~json
{ "defaultTools": ["+codemode"] }
~~~

This example extends inherited defaults. Do not replace an existing custom allowlist with this entire settings object: retain that list and add codemode, or use a project-level additive setting over your user selection. No Hashline recipe changes your global settings.

Codemode normally runs alongside direct tools. Setting `codemode.mode` to `"only"` is opt-in and hides direct tool declarations without bypassing permissions. Await `searchTools()` and `describeTool()` to discover callable tools and their declarations. Tools omitted by the default inline declaration budget remain discoverable.

## Composition rules

Use `Promise.allSettled` for independent reads/searches when partial success matters. Await dependent same-file mutations serially and obtain fresh anchors after a mutation. Do not batch dependent edits concurrently.

Use structured `anchor` and `raw` fields, not parsed rendered text. Do not put LINE:HASH, hash-only or diff prefixes in replacement content. No scripts bypass the host tool pipeline, permission guards, or cancellation.

Check grep `completeness.search` and `omittedMatches` before claiming exhaustive returned matches. `totalMatches` counts observed matches, not an exhaustive repository total when completeness is unknown. `displayTruncated` alone does not prove structured-record omission.

Branch on read variants before accessing `lines`. Forward real image values with `image(result)`; never print image base64 with `text`, console or return. Image notes can be projected separately.

`errorMode: "value"` only resolves coded extension-owned failures. Preparation/schema errors, permission blocking, cancellation and arbitrary host exceptions can still reject. Use catch or allSettled when those failures matter; VM Errors need not carry custom error codes.

## Small cross-call state is not a transaction

Use store/load for small JSON path, cursor or summary values, not whole files, full tool results or image data. Stored anchors are not proof of current file state: use a fresh read/search before editing a stored path.

Store writes commit only when the script succeeds. A failed script discards its store writes, but **failed scripts do not undo earlier filesystem mutations**. Each branch sees store entries on its own path; resumed sessions preserve committed values. Tests use the real host store and session APIs.

A branch can load committed values from its ancestors, but not writes made only on a sibling path. Returning to a saved branch restores that branch's store view. This is session-tree behavior, not isolation or rollback of filesystem effects.

Committed store entries survive reopening a persisted session. Ephemeral sessions cannot be resumed. The automated check uses actual SessionManager.create/open calls and a real session file; it does not simulate persistence.

## Running the examples

These are raw codemode scripts, not Node programs. No provider credentials are needed for their automated selected-host tests. Run them in a disposable directory. Seed only the files needed for each example:

- Independent batch: alpha.txt containing two lines and search.txt containing needle.
- Completeness: many.txt containing needle matches.
- Search/edit: edit-target.txt containing TODO: change first, KEEP, and TODO: leave this.
- Read variants: alpha.txt, fixture.png (a valid PNG), ambiguous.ts with two run methods, and notice.png containing plain text to exercise delegated text-only read.
- Serial edits: serial.txt containing phase 1.
- Stored path: stored.txt containing two lines.

The tests create isolated fixtures and clean only their generated files/images. Adapt paths deliberately for real work. Examples with expected failures are explicitly labeled below.

The recipes assume Hashline's read, grep, edit and write tools are callable. Hashline normally activates its registered tools; if your explicit allowlist or exclusions disable a required tool, enable it deliberately without discarding the rest of your selection. The tests supply an all-Hashline-tools fixture to the selected host's real loadout hook, rather than exercising CLI selection resolution.

## Independent work with partial success

Only the independent calls run concurrently. Keep request identifiers on rejections; a failure in one request must not discard other results.

<!-- recipe:independent -->
~~~js
const requests = [
  { id: "read", call: () => tools.read({ path: "alpha.txt", limit: 1 }) },
  { id: "search", call: () => tools.grep({ path: "search.txt", pattern: "needle", limit: 100 }) },
  { id: "missing", call: () => tools.read({ path: "absent.txt" }) },
];
const settled = await Promise.allSettled(requests.map(request => request.call()));
const summaries = settled.map((result, index) => {
  const id = requests[index].id;
  if (result.status === "rejected") {
    return { id, status: "rejected", message: result.reason.message };
  }
  const value = result.value;
  if (Array.isArray(value.lines)) {
    return {
      id, status: "fulfilled", path: value.path, range: value.range,
      continuation: value.continuation, warnings: value.warnings,
      lines: value.lines.map(line => ({ anchor: line.anchor, raw: line.raw })),
    };
  }
  if (value.completeness) {
    return {
      id, status: "fulfilled", totalMatches: value.totalMatches,
      completeness: value.completeness,
      records: value.records.filter(record => record.kind === "match")
        .map(record => ({ path: record.path, anchor: record.anchor, raw: record.raw })),
    };
  }
  return { id, status: "fulfilled", notice: value.note ?? value.text };
});
text(summaries);
~~~
<!-- /recipe:independent -->

## Search completeness is separate from display length

The optional grepRequest store value is a small request object; without it this searches many.txt. Unknown native search bounds and structured-record omission prevent exhaustive claims. Display-only truncation does not. Narrow the request or deliberately raise the native limit if necessary; this example does not launch an unbounded counting pass.

<!-- recipe:completeness -->
~~~js
const request = load("grepRequest") ?? { path: "many.txt", pattern: "needle", limit: 100 };
const result = await tools.grep(request);
const returned = result.records.filter(record => record.kind === "match").length;
text({
  observed: result.totalMatches, returned,
  completeness: result.completeness,
  exhaustive: result.completeness.search === "complete"
    && result.completeness.omittedMatches === 0,
});
~~~
<!-- /recipe:completeness -->

## Filter matches before editing

This fixture changes only TODO: change lines. The grep request must have complete returned records before this example edits. Intermediate anchors and source lines stay private; the only output is the edit summary.

<!-- recipe:search-edit -->
~~~js
const path = "edit-target.txt";
const search = await tools.grep({ path, pattern: "TODO:", literal: true, limit: 100 });
if (search.completeness.search !== "complete" || search.completeness.omittedMatches !== 0) {
  throw new Error("Narrow the search before editing an incomplete result");
}
const hits = search.records.filter(record => record.kind === "match"
  && record.raw.startsWith("TODO: change "));
if (hits.length === 0) throw new Error("No intended edit targets");
const edited = await tools.edit({
  path,
  edits: hits.map(hit => ({ set_line: {
    anchor: hit.anchor, new_text: hit.raw.replace("TODO: change ", "DONE: "),
  } })),
});
text({ ok: edited.ok, changed: hits.length, warnings: edited.warnings });
~~~
<!-- /recipe:search-edit -->

## Handle the read union before projecting

The optional readRequest value is a small request object. Ambiguity is a successful choice response, not a range. Preserve its selector guidance. Notice values have no anchors. Images use image(), never JSON printing of their data.

<!-- recipe:read-variants -->
~~~js
const request = load("readRequest") ?? { path: "alpha.txt", limit: 1, errorMode: "value" };
const result = await tools.read(request);
if (result.ok === false) {
  text({ kind: "failure", code: result.error.code, message: result.error.message, hint: result.error.hint });
} else if (result.type === "image") {
  text({ kind: "image", mimeType: result.mimeType, note: result.note });
  image(result);
} else if (result.ambiguity) {
  text({ kind: "ambiguity", path: result.path, ambiguity: result.ambiguity, choices: result.text });
} else if (result.kind === "notice") {
  text({ kind: "notice", notice: result.text, warnings: result.warnings });
} else if (Array.isArray(result.lines)) {
  text({
    kind: "text", path: result.path, range: result.range,
    continuation: result.continuation, warnings: result.warnings,
    lines: result.lines.map(line => ({ anchor: line.anchor, raw: line.raw })),
  });
} else {
  throw new Error("Unexpected read result");
}
~~~
<!-- /recipe:read-variants -->

## Dependent edits are serial

Read anew after each mutation. Printing the edit statuses is enough; retain warnings without printing source/diff copies.

<!-- recipe:serial -->
~~~js
const path = "serial.txt";
const results = [];
for (const replacement of ["phase 2", "phase 3"]) {
  const fresh = await tools.read({ path, limit: 1 });
  if (!Array.isArray(fresh.lines)) throw new Error("Expected text edit target");
  const edited = await tools.edit({
    path, edits: [{ set_line: { anchor: fresh.lines[0].anchor, new_text: replacement } }],
  });
  results.push({ ok: edited.ok, warnings: edited.warnings });
}
text({ ok: results.every(result => result.ok), steps: results.length,
  warnings: results.flatMap(result => result.warnings) });
~~~
<!-- /recipe:serial -->

## Discover hidden tools asynchronously

Await the real discovery APIs. Print a declaration only when needed; do not dump ALL_TOOLS or all tool results. Safety guidelines are part of these descriptions.

<!-- recipe:discovery -->
~~~js
const matches = await searchTools("read files images", { limit: 3 });
const read = await describeTool("read");
if (!read) throw new Error("Read is not callable in this loadout");
text({ names: matches.map(tool => tool.name), read });
~~~
<!-- /recipe:discovery -->

## Keep a small cursor across calls

First call: keep only path, cursor and summary. Do not store page.lines or anchors.

<!-- recipe:store-path -->
~~~js
const path = "stored.txt";
const page = await tools.read({ path, limit: 1 });
if (!Array.isArray(page.lines)) throw new Error("Expected text page");
const work = { path, nextOffset: page.continuation?.nextOffset ?? null, summary: "prepared" };
store("work", work);
text(work);
~~~
<!-- /recipe:store-path -->

Later call: even if another script changed the file, reacquire its current anchor. The cursor is continuation state, not an edit-safety guarantee.

<!-- recipe:resume-edit -->
~~~js
const work = load("work");
if (!work || typeof work.path !== "string") throw new Error("No stored path");
const fresh = await tools.read({ path: work.path, limit: 1 });
if (!Array.isArray(fresh.lines)) throw new Error("Expected current text target");
const edited = await tools.edit({
  path: work.path,
  edits: [{ set_line: { anchor: fresh.lines[0].anchor, new_text: fresh.lines[0].raw + "!" } }],
});
text({ ok: edited.ok, warnings: edited.warnings });
~~~
<!-- /recipe:resume-edit -->

## Expected failure: storage is not filesystem rollback

Run only in a disposable directory. This script intentionally fails. A previously committed work value remains committed, its new work value is discarded, and failed.txt remains changed. Subsequent scripts can recover deliberately; failed scripts do not undo earlier filesystem mutations.

<!-- recipe:store-failure -->
~~~js
await tools.write({ path: "failed.txt", content: "mutation survives\n" });
store("work", { path: "uncommitted.txt", summary: "not committed" });
throw new Error("Demonstration failure after a real mutation");
~~~
<!-- /recipe:store-failure -->

See [workflow measurements](codemode-benchmarks.md) for reproducible normal-versus-codemode-only size and overhead evidence. These deterministic measurements are not a recommendation to change your default tool exposure.

## Migrate Nu source inspection

Use read/grep/ast_search for source files rather than Nushell file-opening pipelines. Seed inspect.ts with three lines: console.log("one");, console.log("two");, console.log("three");, each on its own line. sourcePath optionally selects another path; sourceReadOffset optionally selects the read start (default 1). Each input request admits at most two lines or matches. Only independent inspection calls run in parallel.

A match limit does not bound a multiline AST match or raw source string. This projection returns at most two AST files, two ranges and two source lines per file, two grep match records, and two read warnings. Raw is retained only in full, at most 160 UTF-16 code units AND 160 ASCII-JSON content characters; otherwise rawOmitted/rawLength replace raw, never a clipped preview. Paths, failure messages, warning codes/messages and ambiguity queries have the same encoded-string bound and explicit omitted-character counts. Warning/line/record/range/file omissions are counted. No rendered text or image base64 is copied.

Native read truncation and continuation, warning codes/messages, grep completeness, and AST truncation stay separate from projection omissions. projectionComplete refers only to this projection of returned inputs; it does not establish native search/source completeness. Grep's nativeSearchComplete is conservative and exhaustive requires both native completeness and a complete match projection, within the requested path/pattern. Read and AST never claim exhaustive source views here. Non-text reads retain their variant discriminant, warnings and applicable ambiguity metadata; use [the read-union recipe](#handle-the-read-union-before-projecting) for full image/ambiguity handling.

The emitted ASCII JSON is limited to 6000 characters before text(), below the 2000-token recovery cap. If that aggregate budget would be exceeded, source-detail arrays are omitted explicitly with outputBudgetOmitted while bounded failures/warnings, native truncation/continuation and completeness remain. Unexpected oversized metadata fails explicitly instead of silently clipping a raw/anchor pair. Codemode also has a 60-second script deadline.

Keep the `// @options:` line as the script's first line. The host rejects a script whose options line appears later, so place optional `store(...)` seeds after that line, not before it.

Omitted raw must be reacquired with a suitably narrowed read before preparing an edit; do not use a preview or omission marker as source content. Reacquire fresh anchors after any mutation and serialize dependent edits. See [Nu deprecation](nu-deprecation.md) for the policy.

<!-- recipe:nu-source -->
~~~js
// @options: {"max_output_tokens": 2000, "timeout_ms": 60000}
const path = load("sourcePath") ?? "inspect.ts";
const MAX_ITEMS = 2;
const MAX_RAW_CHARS = 160;
const MAX_JSON_CHARS = 6000;
function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g,
    ch => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
}
function boundedString(value) {
  const original = String(value ?? "");
  let shown = original.slice(0, MAX_RAW_CHARS);
  while (asciiJson(shown).length > MAX_RAW_CHARS + 2) shown = shown.slice(0, -1);
  return { value: shown, omittedChars: original.length - shown.length };
}
function stringField(key, value) {
  const bounded = boundedString(value);
  return { [key]: bounded.value, [key + "OmittedChars"]: bounded.omittedChars };
}
function sourceLine(line) {
  return line.raw.length <= MAX_RAW_CHARS && asciiJson(line.raw).length <= MAX_RAW_CHARS + 2
    ? { anchor: line.anchor, raw: line.raw }
    : { anchor: line.anchor, rawOmitted: true, rawLength: line.raw.length };
}
function projectLines(lines) {
  const selected = lines.slice(0, MAX_ITEMS).map(sourceLine);
  return { lines: selected, projection: {
    omittedLines: lines.length - selected.length,
    omittedRawStrings: selected.filter(line => line.rawOmitted).length,
  } };
}
function projectWarnings(warnings = []) {
  const selected = warnings.slice(0, MAX_ITEMS).map(warning => ({
    ...stringField("code", warning.code), ...stringField("message", warning.message),
  }));
  return { warnings: selected, warningProjection: {
    omittedWarnings: warnings.length - selected.length,
    omittedWarningChars: selected.reduce((sum, warning) =>
      sum + warning.codeOmittedChars + warning.messageOmittedChars, 0),
  } };
}
const requests = [
  { id: "read", call: () => tools.read({ path, offset: load("sourceReadOffset") ?? 1, limit: 2 }) },
  { id: "grep", call: () => tools.grep({ path, pattern: "console.log", literal: true, limit: 2 }) },
  { id: "ast", call: () => tools.ast_search({ path, pattern: "console.log($$$ARGS)", lang: "typescript", limit: 2 }) },
];
const settled = await Promise.allSettled(requests.map(request => request.call()));
let rows = settled.map((result, index) => {
  const id = requests[index].id;
  if (result.status === "rejected") return { id, status: "rejected", exhaustive: false,
    ...stringField("message", result.reason.message) };
  const value = result.value;
  const location = stringField("path", value.path ?? path);
  if (id === "read") {
    const warnings = projectWarnings(value.warnings);
    if (!Array.isArray(value.lines)) return { id, status: "variant", exhaustive: false,
      kind: value.kind ?? value.type ?? (value.ambiguity ? "ambiguity" : "unknown"),
      ...location, ...warnings,
      ambiguity: value.ambiguity ? {
        ...stringField("query", value.ambiguity.query), totalCandidates: value.ambiguity.totalCandidates,
      } : null };
    const projected = projectLines(value.lines);
    return { id, status: "fulfilled", ...location, range: value.range, ...warnings,
      truncation: value.truncation ?? null, continuation: value.continuation,
      ...projected, exhaustive: false,
      projectionComplete: location.pathOmittedChars === 0
        && warnings.warningProjection.omittedWarnings === 0
        && warnings.warningProjection.omittedWarningChars === 0
        && projected.projection.omittedLines === 0 && projected.projection.omittedRawStrings === 0 };
  }
  if (id === "grep") {
    const matches = value.records.filter(record => record.kind === "match");
    const records = matches.slice(0, MAX_ITEMS).map(record => ({
      kind: record.kind, ...stringField("path", record.path), ...sourceLine(record),
    }));
    const projection = {
      filteredContextRecords: value.records.length - matches.length,
      omittedRecords: matches.length - records.length,
      omittedRawStrings: records.filter(record => record.rawOmitted).length,
      omittedPathChars: records.reduce((sum, record) => sum + record.pathOmittedChars, 0),
    };
    const projectionComplete = location.pathOmittedChars === 0
      && projection.omittedRecords === 0 && projection.omittedRawStrings === 0
      && projection.omittedPathChars === 0;
    const nativeSearchComplete = value.completeness.search === "complete"
      && value.completeness.omittedMatches === 0 && !value.completeness.limitReached
      && !value.completeness.nativeTruncated && !value.completeness.displayTruncated;
    return { id, status: "fulfilled", ...location, observed: value.totalMatches,
      completeness: value.completeness, nativeSearchComplete, records, projection,
      projectionComplete, exhaustive: nativeSearchComplete && projectionComplete };
  }
  const files = value.files.slice(0, MAX_ITEMS).map(file => {
    const projected = projectLines(file.lines);
    return { ...stringField("path", file.path), ranges: file.ranges.slice(0, MAX_ITEMS),
      lines: projected.lines, projection: {
        ...projected.projection, omittedRanges: file.ranges.length - Math.min(file.ranges.length, MAX_ITEMS),
      } };
  });
  const projection = { omittedFiles: value.files.length - files.length };
  return { id, status: "fulfilled", ...location, truncation: value.truncation ?? null,
    exhaustive: false, files, projection,
    projectionComplete: location.pathOmittedChars === 0 && projection.omittedFiles === 0
      && files.every(file => file.pathOmittedChars === 0 && file.projection.omittedLines === 0
        && file.projection.omittedRawStrings === 0 && file.projection.omittedRanges === 0) };
});
let output = asciiJson(rows);
if (output.length > MAX_JSON_CHARS) {
  rows = rows.map(({ lines, records, files, ...metadata }) => ({
    ...metadata, exhaustive: false, projectionComplete: false,
    outputBudgetOmitted: {
      lines: lines?.length ?? 0, records: records?.length ?? 0, files: files?.length ?? 0,
    },
  }));
  output = asciiJson(rows);
}
if (output.length > MAX_JSON_CHARS) throw new Error("Source metadata exceeds 6000 JSON characters; narrow the request.");
text(output);
~~~
<!-- /recipe:nu-source -->

## Migrate Nu discovery summaries

Seed migration/a.ts with a, migration/b.ts with bbb, and migration/c.ts with cccc. This lists at most two direct entries and finds at most two non-empty TypeScript files up to 1KB, within maxDepth 1, largest first. find matches basenames, respects .gitignore, and filters/sorts before its result limit; ls lists one directory including dotfiles. The optional discoveryPath store value changes the shared directory.

The JavaScript filters file entries, joins find's root-relative paths with ls entry names for this same directory, and counts only the returned intersection. It does not stat files or expose a size/mtime value in returned entries. Subdirectory find paths cannot match a direct ls basename in this join. Exhaustive means complete returned inputs within the stated requests/filters, not every repository file. Preserve each input's truncation or rejection; an incomplete or failed input cannot support an exhaustive summary. Output has a 2000-token recovery cap and a 60-second script deadline.

<!-- recipe:nu-discovery -->
~~~js
// @options: {"max_output_tokens": 2000, "timeout_ms": 60000}
const path = load("discoveryPath") ?? "migration";
const requests = [
  { id: "ls", call: () => tools.ls({ path, glob: "*.ts", limit: 2 }) },
  { id: "find", call: () => tools.find({ path, pattern: "*.ts", maxDepth: 1,
    type: "file", minSize: 1, maxSize: "1KB", sortBy: "size", reverse: true, limit: 2 }) },
];
const settled = await Promise.allSettled(requests.map(request => request.call()));
const inputs = settled.map((result, index) => result.status === "rejected"
  ? { id: requests[index].id, status: "rejected", message: result.reason.message }
  : { id: requests[index].id, status: "fulfilled", truncated: result.value.truncated,
    entries: result.value.entries });
const listed = settled[0].status === "fulfilled" ? settled[0].value.entries : [];
const found = settled[1].status === "fulfilled" ? settled[1].value.entries : [];
const selected = new Set(found.filter(entry => entry.type === "file").map(entry => entry.path));
const joined = listed.filter(entry => entry.type === "file" && selected.has(entry.name))
  .map(entry => ({ path: entry.name, type: entry.type }));
text({ inputs, joined, counts: { joinedFiles: joined.length },
  exhaustive: inputs.every(input => input.status === "fulfilled" && input.truncated === false) });
~~~
<!-- /recipe:nu-discovery -->

## Migrate external CLI JSON

Bash remains the path for external commands. Codemode cannot spawn a process itself. Run a CLI with a timeout, check native exit/truncation metadata, then parse and project its JSON privately. Do not parse RTK/rendered output or print both raw output and summaries.

For a credential-free demonstration, seed migration-report.cjs with:
```js
console.log(JSON.stringify([
  { number: 1, title: "first", state: "OPEN" },
  { number: 2, title: "second", state: "CLOSED" },
]));
```
The labeled codemode script invokes that Node CLI. Adapt cliCommand deliberately for a real external CLI producing the same bounded shape, for example gh issue list --limit 5 --json number,title,state (requires its own installation/authentication). This fixture verifies the tool/JSON boundary, not a remote GitHub integration or provider credentials. It is not a Bash replacement for reading repository files.

The CLI must return at most five issue rows. Parse at most 65536 output characters and print at most five 120-character titles; the Bash timeout is ten seconds and codemode has a 60-second deadline and 2000-token recovery cap. Counts describe returned rows only, not all remote issues. Failed/rejected, nonzero, truncated, oversized, malformed JSON, and wrong-shape responses are reported before aggregation. Native Bash may retain at most 1 MiB in output; truncated JSON must not be parsed. Retain full_output_path for deliberate recovery. PI_RTK_BYPASS does not bypass native truncation.

<!-- recipe:nu-cli -->
~~~js
// @options: {"max_output_tokens": 2000, "timeout_ms": 60000}
const command = load("cliCommand") ?? "node migration-report.cjs";
let result;
try {
  result = await tools.bash({ command, timeout: 10 });
} catch (error) {
  text({ status: "rejected", message: error.message });
  exit();
}
const metadata = { exit_code: result.exit_code, truncated: result.truncated,
  full_output_path: result.full_output_path ?? null, wall_time_seconds: result.wall_time_seconds };
if (result.exit_code !== 0) {
  text({ status: "nonzero-exit", ...metadata });
} else if (result.truncated) {
  text({ status: "truncated", ...metadata });
} else if (result.output.length > 65536) {
  text({ status: "output-too-large", ...metadata });
} else {
  let rows;
  try { rows = JSON.parse(result.output); }
  catch (error) { text({ status: "invalid-json", ...metadata, message: error.message }); exit(); }
  if (!Array.isArray(rows) || rows.length > 5
    || rows.some(row => !row || typeof row.number !== "number"
      || typeof row.title !== "string" || typeof row.state !== "string")) {
    text({ status: "invalid-shape", ...metadata });
    exit();
  }
  const open = rows.filter(row => row.state === "OPEN");
  text({ status: "ok", ...metadata, returned: rows.length, openCount: open.length,
    issues: open.map(row => ({ number: row.number, title: row.title.slice(0, 120) })),
    scope: "returned CLI rows only" });
}
~~~
<!-- /recipe:nu-cli -->

The test removes the generated native Bash recovery log in finally. Do not print large raw subprocess output into the model context or add a replacement structured shell API.
