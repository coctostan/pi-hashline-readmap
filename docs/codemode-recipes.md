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
