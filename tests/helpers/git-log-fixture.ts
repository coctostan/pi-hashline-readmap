// Synthetic `git log` output, shaped like git's default, `--graph` and `--oneline` formats.
export const sha = (i: number): string => i.toString(16).padStart(40, "a");

function commitLines(i: number): string[] {
  return [
    `commit ${sha(i)}`,
    "Author: A <a@example.test>",
    "Date:   Mon Jan 1 00:00:00 2024 +0000",
    "",
    `    subject ${i}`,
    "",
    `    ${"body ".repeat(30)}${i}`,
    "    commit 1234567 named in a body is no header",
    "    * commit 7654321 in a body bullet is no header",
  ];
}

export function gitLog(count: number): string {
  return Array.from({ length: count }, (_, i) => commitLines(i).join("\n")).join("\n\n") + "\n";
}

export function gitLogGraph(count: number): string {
  const commit = (i: number) => commitLines(i).map((line, j) => (j === 0 ? `* ${line}` : `| ${line}`).trimEnd());
  return Array.from({ length: count }, (_, i) => commit(i).join("\n")).join("\n|\n") + "\n";
}

export function gitLogOneline(count: number): string {
  return Array.from({ length: count }, (_, i) => `${sha(i).slice(0, 7)} subject ${i}`).join("\n") + "\n";
}
