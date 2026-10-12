import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { it } from "vitest";
import { jsonOf, recipe, runProgram, supported } from "./helpers/codemode-recipes.js";

const code = recipe("nu-source");
it.skipIf(!supported)("projects bounded source inspection with anchors and honest incompleteness", () => {
  const reports: any[] = [];
  try {
    const report = runProgram({
      files: { "inspect.ts": 'console.log("one");\nconsole.log("two");\nconsole.log("three");\n' },
      steps: [{ code }, { code: 'store("sourcePath", "absent.ts");\n' + code }],
    });
    reports.push(report);
    const rows = jsonOf(report);
    assert.deepEqual(rows.map((row: any) => row.id), ["read", "grep", "ast"]);
    assert.deepEqual(rows.map((row: any) => row.status), ["fulfilled", "fulfilled", "fulfilled"]);
    assert.equal(rows[0].range.totalLines, 3);
    assert.equal(rows[0].lines.length, 2);
    assert.equal(rows[0].continuation.nextOffset, 3);
    assert.deepEqual(rows[0].warnings, []);
    assert.ok(Object.hasOwn(rows[0], "truncation"));
    assert.equal(rows[0].truncation, null);
    assert.deepEqual(rows[0].projection, { omittedLines: 0, omittedRawStrings: 0 });
    assert.equal(rows[0].projectionComplete, true);
    assert.equal(rows[0].exhaustive, false);
    assert.match(rows[0].lines[0].anchor, /^1:[a-f0-9]+$/);
    assert.equal(rows[0].lines[0].raw, 'console.log("one");');
    assert.equal(rows[1].records.length, 2);
    assert.equal(rows[1].records[0].kind, "match");
    assert.equal(rows[1].completeness.search, "unknown");
    assert.equal(rows[1].completeness.limitReached, true);
    assert.equal(rows[1].nativeSearchComplete, false);
    assert.equal(rows[1].exhaustive, false);
    assert.equal(rows[1].records[0].anchor, rows[0].lines[0].anchor);
    assert.equal(rows[2].truncation.matchLimit.omittedMatches, 1);
    assert.equal(rows[2].exhaustive, false);
    assert.equal(rows[2].files[0].lines[0].anchor, rows[0].lines[0].anchor);
    const missing = jsonOf(report, 1);
    assert.ok(missing.every((row: any) => row.status === "rejected" && /absent.ts/.test(row.message)));
    assert.ok(missing.every((row: any) => row.exhaustive === false && row.messageOmittedChars === 0));

    // Separate subprocesses keep each PI_CODEMODE_PROGRAM environment value below OS argument limits.
    function inspect(path: string, content: string, offset = 1): any[] {
      const current = runProgram({
        files: { [path]: content },
        steps: [{ code: 'store("sourcePath", ' + JSON.stringify(path) + ');\n'
          + 'store("sourceReadOffset", ' + offset + ');\n' + code }],
      });
      reports.push(current);
      return jsonOf(current);
    }

    const long = inspect("long.ts", "// " + "x".repeat(60000)
      + '\nconsole.log("one");\nconsole.log("two");\n');
    assert.ok(Object.hasOwn(long[0], "truncation"));
    assert.equal(long[0].lines[0].rawOmitted, true);
    assert.equal(long[0].lines[0].rawLength, 60003);
    assert.ok(!Object.hasOwn(long[0].lines[0], "raw"));
    assert.equal(long[0].projection.omittedRawStrings, 1);
    assert.equal(long[0].projectionComplete, false);
    assert.equal(long[0].exhaustive, false);
    assert.equal(long[0].continuation.nextOffset, 3);

    const multiline = inspect("multi.ts", "console.log(\n"
      + Array(300).fill('  "' + "x".repeat(200) + '",').join("\n") + "\n);\n");
    const ast = multiline[2];
    assert.equal(ast.truncation.outputBudget.omittedBlocks, 1);
    assert.ok(ast.truncation.outputBudget.totalBytes > ast.truncation.outputBudget.maxBytes);
    assert.equal(ast.files[0].lines.length, 2);
    assert.equal(ast.files[0].lines[0].raw, "console.log(");
    assert.equal(ast.files[0].lines[1].rawOmitted, true);
    assert.equal(ast.files[0].projection.omittedLines, 300);
    assert.equal(ast.files[0].projection.omittedRawStrings, 1);
    assert.equal(ast.projectionComplete, false);
    assert.equal(ast.exhaustive, false);

    // Encoding bounds matter too: a short raw string can expand in ASCII JSON.
    const unicodeCall = 'console.log("' + "é".repeat(100) + '");';
    const encoded = inspect("encoded.ts", unicodeCall + "\n");
    assert.ok(unicodeCall.length < 160);
    for (const [row, line] of [
      [encoded[0], encoded[0].lines[0]],
      [encoded[1], encoded[1].records[0]],
      [encoded[2], encoded[2].files[0].lines[0]],
    ]) {
      assert.equal(line.rawOmitted, true);
      assert.equal(line.rawLength, unicodeCall.length);
      assert.ok(!Object.hasOwn(line, "raw"));
      assert.equal(row.projectionComplete, false);
      assert.equal(row.exhaustive, false);
    }
    assert.equal(encoded[1].nativeSearchComplete, true);
    assert.equal(encoded[1].projection.omittedRawStrings, 1);

    const notice = inspect("notice.png", "delegated notice\n", 0);
    assert.equal(notice[0].status, "variant");
    assert.equal(notice[0].kind, "notice");
    assert.equal(notice[0].exhaustive, false);
    assert.deepEqual(notice[0].warnings, [{
      code: "params-adjusted", codeOmittedChars: 0,
      message: "[Read params adjusted: ignored offset 0]", messageOmittedChars: 0,
    }]);
    assert.deepEqual(notice[0].warningProjection, { omittedWarnings: 0, omittedWarningChars: 0 });
    assert.ok(!Object.hasOwn(notice[0], "text"));
    assert.ok(!Object.hasOwn(notice[0], "data"));

    for (const current of reports) for (let i = 0; i < current.results.length; i++) {
      const result = current.results[i];
      const projected = jsonOf(current, i);
      assert.equal(result.calls.length, 3);
      assert.ok(result.outputBytes < 8000);
      assert.ok(JSON.stringify(projected).length <= 6000);
      assert.ok(!result.text.includes("Warning: truncated output"));
      assert.ok(!JSON.stringify(projected).includes('"text":'));
      assert.ok(!JSON.stringify(projected).includes('"display":'));
    }
  } finally {
    // Clean recovery files even if a future regression clips output and an assertion fails.
    for (const current of reports) for (const result of current.results) {
      for (const match of result.text.matchAll(/\[Full output: (.+?) \(read with offset\/limit\)\]/g)) {
        rmSync(match[1], { force: true });
      }
    }
  }
}, 130_000);
