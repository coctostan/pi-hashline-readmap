/**
 * Run one locate task's checker on a workspace and print its failures as JSON. The A/B harness runs
 * this in a child process with a timeout, since a checker imports model-written code that may hang.
 *
 * Usage: node scripts/bench/locate-tasks/check.mjs <task-id> <workspace>
 */
import { TASKS } from "./tasks.mjs";

const [id, root] = process.argv.slice(2);
const task = TASKS.find((candidate) => candidate.id === id);
if (!task || !root) {
	console.error(`usage: check.mjs <task-id> <workspace>${id && !task ? ` (unknown task: ${id})` : ""}`);
	process.exit(2);
}
// Model-written code may leave timers or handles open, so exit once the verdict is flushed (pipes are async on macOS).
process.stdout.write(JSON.stringify(await task.check(root)), () => process.exit(0));
