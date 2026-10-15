import { parseArgs } from "node:util";
import path from "node:path";
import { profileDir } from "../src/lib/local-store/editing-memory";
import { createActivityMonitor } from "../src/lib/observability/agent-activity";
const { values } = parseArgs({ options: { watch: { type: "boolean" }, rebuild: { type: "boolean" }, drain: {type:"boolean"}, since: { type: "string" }, directory: { type: "string" }, help: { type: "boolean" } } });
if (values.help) console.log("pnpm agent-activity [--watch] [--rebuild] [--drain] [--since ISO-TIME] [--directory PRIVATE-PATH]\nOnly this repository's Codex/Claude session tool records. Local redacted content; no remote export. First start defaults to now; subsequent starts resume.");
else {
  if (values.since && !Number.isFinite(Date.parse(values.since))) throw new Error("Invalid --since");
  const monitor = createActivityMonitor({ workspace: process.cwd(), directory: values.directory ?? path.join(profileDir(), "agent-activity"), since: values.since, rebuild: values.rebuild });
  let first = true;
  const tick = () => { try { let result = monitor.tick(); if(values.drain){let pending=Infinity;while(result.pending_bytes>0&&result.pending_bytes<pending){pending=result.pending_bytes;result=monitor.tick();}} if (first || result.imported) console.log(JSON.stringify(result)); first = false; } catch (error) { console.error("Activity capture failed:", error instanceof Error ? error.message : "unknown error"); if (!values.watch) process.exitCode = 1; } };
  tick();
  if (!values.watch) monitor.close();
  if (values.watch) { const timer = setInterval(tick, 10000); for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { clearInterval(timer); monitor.close(); process.exit(0); }); }
}
