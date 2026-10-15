import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { profileDir, readEditingProfile, retroPath, exportCheckpointReady, type RetroRecord } from "../src/lib/local-store/editing-memory";
import { activityRetroSelectionSchema, buildActivityRetroPacket, type ActivitySessionEvidence } from "../src/lib/observability/activity-retro";
import type { Activity } from "../src/lib/observability/agent-activity";

const { values } = parseArgs({ options: { selection: { type: "string" }, standalone: { type: "boolean" }, help: { type: "boolean" } } });
if (values.help) console.log("pnpm tool-candidates --selection PRIVATE-JSON [--standalone]\nFreeze scoped activity for a chat-only review. Standalone mode requires an explicit task review request; export mode retains completed-export/retro gates.");
else {
  if (!values.selection) throw new Error("--selection is required; see the tool-candidate-review skill");
  const selection = activityRetroSelectionSchema.parse(JSON.parse(fs.readFileSync(values.selection, "utf8")));
  if (Boolean(values.standalone) !== (selection.mode === "standalone")) throw new Error("--standalone must match the selection mode");
  let checkpoint: RetroRecord | undefined;
  const profile = selection.mode === "export" ? readEditingProfile() : { learning: false, agent_retros: false };
  if (selection.mode === "export") {
    if (!profile.learning || !profile.agent_retros) throw new Error("Learning/retros disabled; no activity imported");
    checkpoint = JSON.parse(fs.readFileSync(retroPath(selection.project_id!, selection.checkpoint_id!), "utf8")) as RetroRecord;
    if (checkpoint.checkpoint.trigger !== "export" || !exportCheckpointReady(checkpoint)) throw new Error("Export has not completed");
  }
  const workspace = fs.realpathSync(process.cwd());
  const key = createHash("sha256").update(workspace).digest("hex").slice(0,24);
  const root = path.join(profileDir(), "agent-activity", key);
  const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8"));
  if (index.workspace !== workspace) throw new Error("Activity workspace mismatch");
  const sessions: Record<string, ActivitySessionEvidence> = {};
  for (const id of new Set(selection.selections.map(s => s.session))) {
    const entry = index.sessions.find((s: { source: string }) => createHash("sha256").update(s.source).digest("hex").slice(0,24) === id);
    if (!entry) throw new Error("Selected session is not registered in this workspace");
    const file = path.join(root, id, "events.jsonl");
    const rows = fs.readFileSync(file, "utf8").split("\n");
    // A writer may be midway through the final record; omit and report it, never repair its file.
    const tail = rows.pop();
    let gaps = Number(entry.gaps) || 0;
    if (tail?.trim()) gaps++;
    const events: Activity[] = [];
    for (const row of rows) {
      if (!row.trim()) continue;
      try { events.push(JSON.parse(row)); } catch { gaps++; }
    }
    sessions[id] = { events, gaps, pending_bytes: Number(entry.pending_bytes) || 0 };
  }
  const packet = buildActivityRetroPacket({ selection, checkpoint, learning: profile.learning, agentRetros: profile.agent_retros,
    exportCompleted: checkpoint ? exportCheckpointReady(checkpoint) : false, standaloneRequested: values.standalone, sessions });
  const folder = selection.mode === "export"
    ? path.join(root, "retro-evidence", selection.project_id!, selection.checkpoint_id!)
    : path.join(root, "tool-candidate-evidence", selection.task_id!);
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const file = path.join(folder, `${packet.packet_id}.json`);
  // Immutable content-addressed file: repeat selection reuses the same packet.
  const serialized = JSON.stringify(packet, null, 2) + "\n";
  try { fs.writeFileSync(file, serialized, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST" || fs.readFileSync(file, "utf8") !== serialized) throw error;
  }
  console.log(JSON.stringify({ packet_id: packet.packet_id, file, selected_calls: packet.evidence.length, destination: "chat-only" }, null, 2));
}
