import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const lockedHost = resolve(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "..");
const host = process.env.PI_COMPAT_HOST ? resolve(process.env.PI_COMPAT_HOST) : lockedHost;
const supported = existsSync(join(host, "dist/extensions/codemode/execute.js"));
if (process.env.PI_COMPAT_HOST && !supported) throw new Error("Explicit compatibility host has no codemode executor");
type BoundaryCase = {
  name: string; code: string; images?: number; visible?: boolean;
  directImage?: boolean; discovery?: boolean; bash?: boolean;
};
const cases: BoundaryCase[] = [
  {
    name: "private anchored edit does not leak a notice",
    code: String.raw`
      await tools.write({path:"private.ts",content:"export const privateValue = 1;\n"});
      const r = await tools.read({path:"private.ts"});
      const e = await tools.edit({path:"private.ts",edits:[{set_line:{
        anchor:r.lines[0].anchor,new_text:"export const privateValue = 2;"
      }}]});
      check(e.ok, "private anchored edit");
    `,
  },
  {
    name: "visible read survives private reread as an invalidation subject",
    visible: true,
    code: String.raw`
      const r = await tools.read({path:"visible.ts"});
      check((await tools.edit({path:"visible.ts",edits:[{set_line:{
        anchor:r.lines[0].anchor,new_text:"export const visible = 2;"
      }}]})).ok, "visible/private edit");
    `,
  },
  {
    name: "bounded grep supports anchored edits",
    code: String.raw`
      await tools.write({path:"many.txt",content:"needle\n".repeat(4)});
      const g = await tools.grep({path:"many.txt",pattern:"needle",limit:3});
      check(g.completeness.search === "unknown" && g.completeness.limitReached && g.totalMatches === 3, "bounded grep");
      check((await tools.edit({path:"many.txt",edits:[{set_line:{
        anchor:g.records[0].anchor,new_text:"changed"
      }}]})).ok, "grep edit chain");
    `,
  },
  {
    name: "discovery fits the default inline budget",
    discovery: true,
    code: String.raw`
      const r = await describeTool("read");
      const g = await describeTool("grep");
      check(r.includes("mimeType") && r.includes("strictSymbol") && r.includes("errorMode"), "read discovery");
      check(g.includes("completeness") && g.includes("omittedMatches"), "grep discovery");
    `,
  },
  {
    name: "native images forward through image with adjustment notes",
    images: 2, directImage: true,
    code: String.raw`
      for (const path of ["fixture.png","magic.dat"]) {
        const r = await tools.read({path,offset:0});
        check(r.type === "image" && r.data.length > 0 && r.note.includes("params adjusted"), "image envelope/notes");
        image(r);
      }
    `,
  },
  {
    name: "execute-owned errors expose opt-in codes",
    code: String.raw`
      const missing = await tools.read({path:"missing.ts",errorMode:"value"});
      check(missing.ok === false && missing.error.code === "file-not-found", "typed missing file");
      const invalid = await tools.read({path:"missing.ts",offset:-1,errorMode:"value"});
      check(invalid.error.code === "invalid-offset", "typed invalid input");
    `,
  },
  {
    name: "Promise.allSettled preserves preparation and default rejections",
    code: String.raw`
      await tools.write({path:"good.ts",content:"export const good = 1;\n"});
      const settled = await Promise.allSettled([
        tools.read({path:"good.ts"}), tools.read({path:"missing.ts"}),
        tools.read({path:null,errorMode:"value"}),
      ]);
      check(settled[0].status === "fulfilled" && settled[1].status === "rejected" && settled[2].status === "rejected", "allSettled defaults");
      check(settled[1].reason.code === undefined && settled[2].reason.code === undefined, "message-only VM errors");
      check(settled[2].reason.message.includes("received null"), "required-null guard");
    `,
  },
  {
    name: "strict symbols distinguish missing from exact",
    code: String.raw`
      await tools.write({path:"symbol.ts",content:"export const exactValue = 1;\n"});
      const missing = await tools.read({path:"symbol.ts",symbol:"ZZZ262",strictSymbol:true,errorMode:"value"});
      check(missing.error.code === "symbol-not-found", "strict symbol");
      const exact = await tools.read({path:"symbol.ts",symbol:"exactValue",strictSymbol:true});
      check(exact.lines.length === 1, "exact symbol");
    `,
  },
  {
    name: "replace_symbol preserves the edit chain",
    code: String.raw`
      await tools.write({path:"function.ts",content:"export function value() { return 1; }\n"});
      await tools.read({path:"function.ts"});
      check((await tools.edit({path:"function.ts",edits:[{replace_symbol:{
        symbol:"value",new_body:"export function value() { return 2; }"
      }}]})).ok, "replace_symbol");
      check((await tools.read({path:"function.ts"})).lines[0].raw.includes("return 2"), "symbol bytes");
    `,
  },
  {
    name: "cross-file copy and move preserve source and destination bytes",
    code: String.raw`
      await tools.write({path:"source.txt",content:"one\ntwo\n"});
      await tools.write({path:"dest.txt",content:"start\n"});
      let s = await tools.read({path:"source.txt"});
      let d = await tools.read({path:"dest.txt"});
      check((await tools.edit({path:"dest.txt",edits:[{copy_lines:{
        from_path:"source.txt",start_anchor:s.lines[0].anchor,end_anchor:s.lines[1].anchor,after_anchor:d.lines[0].anchor
      }}]})).ok, "copy");
      s = await tools.read({path:"source.txt"});
      d = await tools.read({path:"dest.txt"});
      check((await tools.edit({path:"dest.txt",edits:[{move_lines:{
        from_path:"source.txt",start_anchor:s.lines[1].anchor,end_anchor:s.lines[1].anchor,after_anchor:d.lines[2].anchor
      }}]})).ok, "move");
      check((await tools.read({path:"source.txt"})).lines.map(l=>l.raw).join("\n") === "one", "move source");
      check((await tools.read({path:"dest.txt"})).lines.map(l=>l.raw).join("\n") === "start\none\ntwo\ntwo", "move destination");
    `,
  },
  {
    name: "stale anchors reject without mutation",
    code: String.raw`
      await tools.write({path:"atomic.txt",content:"first\nsecond\n"});
      const old = await tools.read({path:"atomic.txt"});
      await tools.write({path:"atomic.txt",content:"new first\nsecond\n"});
      const stale = await tools.edit({path:"atomic.txt",errorMode:"value",edits:[
        {set_line:{anchor:old.lines[0].anchor,new_text:"bad"}}
      ]});
      check(stale.error.code === "hash-mismatch", "stale anchor");
      check((await tools.read({path:"atomic.txt"})).lines.map(l=>l.raw).join("\n") === "new first\nsecond", "stale atomicity");
    `,
  },
  {
    name: "overlapping edits reject atomically",
    code: String.raw`
      await tools.write({path:"atomic.txt",content:"first\nsecond\n"});
      const r = await tools.read({path:"atomic.txt"});
      const overlap = await tools.edit({path:"atomic.txt",errorMode:"value",edits:[
        {replace_lines:{start_anchor:r.lines[0].anchor,end_anchor:r.lines[1].anchor,new_text:"bad"}},
        {replace_lines:{start_anchor:r.lines[1].anchor,end_anchor:r.lines[1].anchor,new_text:"also bad"}}
      ]});
      check(overlap.error.code === "overlapping-edit", "overlap");
      check((await tools.read({path:"atomic.txt"})).lines.map(l=>l.raw).join("\n") === "first\nsecond", "overlap atomicity");
    `,
  },
  {
    name: "long-line pagination retains raw source",
    code: String.raw`
      const long = "needle " + "x".repeat(6000);
      await tools.write({path:"long.txt",content:long+"\ntail\n"});
      const page = await tools.read({path:"long.txt",limit:1});
      check(page.lines[0].raw === long && page.continuation.nextOffset === 2, "long-line pagination");
      check((await tools.read({path:"long.txt",offset:page.continuation.nextOffset})).lines[0].raw === "tail", "continuation");
      const g = await tools.grep({path:"long.txt",pattern:"needle"});
      check(g.records[0].raw === long && g.completeness.displayTruncated, "grep raw fidelity");
    `,
  },
  {
    name: "native Bash raw output survives RTK and bypass",
    bash: true,
    code: String.raw`
      const b = await tools.bash({command:"git log -5"});
      const bypass = await tools.bash({command:"PI_RTK_BYPASS=1 git log -5"});
      check(b.output === bypass.output && !b.output.includes("[RTK:"), "native Bash output");
      check((await tools.bash({command:"printf 'nonzero\\n'; exit 7"})).exit_code === 7, "nonzero exit");
    `,
  },
];

it.skipIf(!supported).each(cases)("$name", boundary => {
  const code = 'function check(ok, message) { if (!ok) throw new Error(message); }\n'
    + boundary.code + '\ntext("case=PASS");';
  const stdout = execFileSync(process.execPath, [resolve("tests/helpers/selected-host-codemode.mjs"), host], {
    cwd: process.cwd(), encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env, PI_CODEMODE_CASE: code, PI_HASHLINE_BASH_CONTEXT_GUARD: "0",
      PI_CODEMODE_VISIBLE: boundary.visible ? "1" : "0",
      PI_CODEMODE_DIRECT_IMAGE: boundary.directImage ? "1" : "0",
      PI_CODEMODE_DISCOVERY: boundary.discovery ? "1" : "0",
      PI_CODEMODE_BASH: boundary.bash ? "1" : "0",
    },
  });
  const result = JSON.parse(stdout.trim().split("\n").at(-1)!);
  expect(result).toMatchObject({
    version: "1.0.0", host, completed: true, images: boundary.images ?? 0,
    staleNotice: boundary.visible ?? false, duplicateNotice: false,
    compressed: boundary.bash ?? false,
  });
}, 130_000);
