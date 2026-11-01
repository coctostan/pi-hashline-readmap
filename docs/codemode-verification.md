# Codemode boundary verification

Automated checks do not hot-reload a running Pi session. Complete `npm test` and both declaration checks (`npm run typecheck` and `npm run typecheck:pi-host`) on the [locked host](../AGENTS.md#host-compatibility) first. Then stop the implementation session and start a new Pi process at the locked version that loads this checkout's `index.ts`. Do not use the pre-update session as updated-code evidence.

Record the date, git commit, launcher path, actual running Pi version and installation directory. Use `command -v pi` and `pi --version`, then inspect the launcher's selected installation rather than assuming a global npm path. A managed install can be identified from `~/.pi/agent/install/current-version`; verify the selected `package.json` version in that release directory. Record these actual values in the issue's verification artifact.

Run the following through the real codemode tool, not Node or a simulated tool harness. Inspect `describeTool("read")` and `describeTool("grep")` first: the declarations must show `strictSymbol`, `errorMode`, image fields and `completeness`. If absent, stop: the checkout was not freshly loaded.

## Original private-read regression

~~~js
const path = "tmp/264-live-private-" + Math.random().toString(36).slice(2) + ".ts";
store("264LivePath", path);
await tools.write({path, content:"export const privateValue = 1;\n"});
const r = await tools.read({path});
const e = await tools.edit({path, edits:[{set_line:{
  anchor:r.lines[0].anchor, new_text:"export const privateValue = 2;"
}}]});
text(e.ok);
~~~

Expected: `true`, with no stale-read notice about the entirely private read. Run twice with separate fresh paths. Retain the exact outer tool result in evidence, not just the boolean.

## Grep completeness and error policy

~~~js
const path = load("264LivePath");
const g = await tools.grep({path, pattern:"privateValue", limit:1});
text({totalMatches:g.totalMatches, returned:g.records.length, completeness:g.completeness});
const missing = await tools.read({path:path+".missing", errorMode:"value"});
const strict = await tools.read({path, symbol:"ZZZ264", strictSymbol:true, errorMode:"value"});
text({missing:missing.error.code, strict:strict.error.code});
const settled = await Promise.allSettled([
  tools.read({path:path+".missing"}),
  tools.read({path:null, errorMode:"value"}),
  tools.read({path, symbol:"privateValue", strictSymbol:true})
]);
text(settled.map(r => r.status === "fulfilled"
  ? {status:r.status, lines:r.value.lines.length}
  : {status:r.status, message:r.reason.message, code:r.reason.code ?? null}));
~~~

Expected: one observed match, unknown completeness and `limitReached` true even at the exact cap; `file-not-found` and `symbol-not-found` values; default missing-file and required-null calls reject without custom code properties; exact symbol resolves.

For the four-match original grep fixture, create a separate temporary text file with `tools.write({path, content:"needle\n".repeat(4)})`, grep it with `limit:3` and record all completeness fields. Do not interpret `totalMatches:3` as an exhaustive count.

Run this explicit grep→edit chain on the generated private fixture:

~~~js
const path = load("264LivePath");
const g = await tools.grep({path, pattern:"privateValue", limit:1});
const hit = g.records.find(r => r.kind === "match");
if (!hit) throw new Error("Expected the generated privateValue fixture");
const e = await tools.edit({path, edits:[{set_line:{
  anchor:hit.anchor, new_text:hit.raw.replace(" = 2;", " = 3;")
}}]});
text({ok:e.ok, observed:g.totalMatches, completeness:g.completeness});
~~~

Expected: `ok: true`, one observed match, unknown completeness and `limitReached: true`. The observed count is bounded by this request; it is not an exhaustive repository-wide total.

## Image forwarding

On the original macOS reproduction host, use the same known-valid asset:

~~~js
const r = await tools.read({
  path:"/System/Library/CoreServices/Applications/Desk View.app/Contents/Resources/MarkerCap.png",
  offset:0
});
text({type:r.type, mimeType:r.mimeType, note:r.note, dataLength:r.data?.length, kind:r.kind});
if (r.type === "image") image(r);
else throw new Error("Expected an actual attachment from the known-valid image fixture");
~~~

On another OS, choose an existing valid PNG instead; record its path and provenance. Do not substitute the malformed mocked fixture from reproduction. Expected: actual image attachment displayed, script image fields accepted by discovery, parameter note retained. Do not print base64.

Pi 1.1.0+ `image()` output reports a saved image path. Record that exact path and recover it through a subsequent real `read` call. Record its MIME type and the attachment. Do not print base64 or infer byte equality solely from visual display; the automated selected-host persistence test separately asserts file-byte equality against actual forwarded attachments and cleans its generated files.

## Raw Bash contract

~~~js
const raw = await tools.bash({command:"git log -5"});
const bypass = await tools.bash({command:"PI_RTK_BYPASS=1 git log -5"});
text({sameRaw:raw.output===bypass.output, hasRtk:raw.output.includes("[RTK:"),
  exit:raw.exit_code, nativeTruncated:raw.truncated});
text(await tools.bash({command:"printf 'live-264\\n'; exit 7"}));
~~~

Also issue `git log -5` as a direct Bash tool call. Expected: direct model presentation may carry an RTK notice; script output is native raw output; bypass does not destructively replace it; exit code 7 remains a native value.

Permission blocking and cancellation are verified with deterministic selected-host fixtures in the automated lane. Record those test results distinctly from this fresh live check; do not issue a destructive permission probe or kill arbitrary live work to imitate the fixture. The fixture's native nested validation/hooks/signal boundary does not establish every AgentSession or user-approval lifecycle branch.

## Visible-read control

Read the most recent private fixture using the direct `read` tool so its anchors are actually model-visible. Then use a codemode script that privately rereads that same file and edits it using the new read's anchor. Print only the edit's `ok` value. Expected: the outer result does contain one stale-read notice about the genuinely visible direct read; the private reread does not suppress it. A further outer result must not repeat that notice.

## Completion gate

Record actual scripts, relevant outputs, the test and declaration-check results, version/installation provenance, checkout commit and unverified boundaries in the change's verification record. Clean only generated fixtures and saved images belonging to these checks. A freshly started Pi process at the locked version loading the final checkout is required. If unavailable, record the blocker and stop short of overall completion. A running pre-update session or automated Node harness is not fresh-live evidence.
