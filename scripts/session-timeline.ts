// Read-only: print a coding-agent session (Claude Code or Codex) as a timeline for a retro, or
// list this repository's recent sessions. See .agents/skills/session-retro/SKILL.md.
//
//   pnpm session-timeline                         # recent sessions for this checkout
//   pnpm session-timeline <session-id|path>       # the whole session
//   pnpm session-timeline <id> --from "apply the speed effect"   # start at that message
//   pnpm session-timeline <id> --json | --preview 600 | --out FILE
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { sessionTimeline, sessionTimelineText, type SessionRuntime } from "../src/lib/observability/session-timeline";

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  from: { type: "string" }, json: { type: "boolean" }, preview: { type: "string" }, out: { type: "string" },
  limit: { type: "string" }, help: { type: "boolean" } } });

const workspace = fs.realpathSync(process.cwd());
const claudeRoot = path.join(os.homedir(), ".claude", "projects", workspace.replace(/[^a-zA-Z0-9]/g, "-"));
const codexRoot = process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME, "sessions") : path.join(os.homedir(), ".codex", "sessions");
const walk = (root: string): string[] => !fs.existsSync(root) ? [] : fs.readdirSync(root, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? walk(path.join(root, entry.name)) : entry.name.endsWith(".jsonl") ? [path.join(root, entry.name)] : []);
/** Codex sessions from every folder share one tree; keep those whose first record names this checkout. */
const codexHere = (file: string) => {
  // Logs can exceed Node's string limit; the first record is all that is needed.
  const fd = fs.openSync(file, "r"), buffer = Buffer.alloc(64 * 1024);
  const head = buffer.subarray(0, fs.readSync(fd, buffer, 0, buffer.length, 0)).toString("utf8").split("\n", 1)[0];
  fs.closeSync(fd);
  try { return JSON.parse(head).payload?.cwd === workspace; } catch { return false; }
};
const sessions = () => [
  ...walk(claudeRoot).filter(file => path.dirname(file) === claudeRoot).map(file => ({ file, runtime: "claude" as SessionRuntime })),
  ...walk(codexRoot).filter(codexHere).map(file => ({ file, runtime: "codex" as SessionRuntime })),
].map(session => ({ ...session, modified: fs.statSync(session.file).mtime })).sort((a, b) => +b.modified - +a.modified);

function locate(target: string) {
  if (fs.existsSync(target)) return { file: target, runtime: (target.includes(`${path.sep}.codex${path.sep}`) ? "codex" : "claude") as SessionRuntime };
  const claudeFile = path.join(claudeRoot, `${target}.jsonl`);
  if (fs.existsSync(claudeFile)) return { file: claudeFile, runtime: "claude" as SessionRuntime };
  const found = sessions().find(session => path.basename(session.file, ".jsonl").includes(target));
  if (!found) throw new Error(`No session file for "${target}" under ${claudeRoot} or this checkout's Codex sessions`);
  return found;
}

if (values.help) console.log('pnpm session-timeline [<session-id|path>] [--from TEXT] [--json] [--preview N] [--out FILE] [--limit N]');
else if (!positionals[0]) {
  for (const session of sessions().slice(0, Number(values.limit ?? 15))) {
    const first = sessionTimeline(fs.readFileSync(session.file, "utf8").split("\n"), { runtime: session.runtime }).entries
      .find(entry => entry.kind === "user")?.text.replace(/\s+/g, " ").slice(0, 70) ?? "";
    console.log(`${session.modified.toISOString().slice(0, 16).replace("T", " ")}  ${session.runtime.padEnd(6)}  ${path.basename(session.file, ".jsonl")}  ${first}`);
  }
} else {
  const session = locate(positionals[0]);
  const timeline = sessionTimeline(fs.readFileSync(session.file, "utf8").split("\n"), { runtime: session.runtime, from: values.from });
  const output = values.json ? JSON.stringify(timeline, null, 2) : sessionTimelineText(timeline, Number(values.preview ?? 240));
  if (values.out) { fs.writeFileSync(values.out, output); console.log(`${timeline.entries.length} entries → ${values.out}`); }
  else console.log(output);
}
