import fs from "node:fs";
import path from "node:path";
import { assertProject } from "./store";
import { projectHistoryDir, projectProposalPath, isSafeProposalId } from "./paths";
import { historyActionLabel, historyOperationLabel, parseHistoryAction, sanitizeHistoryLabel } from "../timeline/history-label";

/** Older restores carry only the snapshot they returned to: a before-snapshot was an Undo, any other a Redo. */
function legacyRestoreLabel(restored: unknown) {
  if (typeof restored !== "string" || restored.length <= 30) return historyOperationLabel("history_restore");
  const op = restored.slice(25, -5);
  return op.endsWith("_before")
    ? historyActionLabel("undo", historyOperationLabel(op.slice(0, -"_before".length)))
    : historyActionLabel("redo", historyOperationLabel(op.replace(/_after$/, "")));
}

/** The step's readable name, shared by Edit history and Project history. */
export function snapshotLabel(projectId: string, header: Record<string, unknown>, op: string) {
  const action = parseHistoryAction(header.history_action);
  let label = sanitizeHistoryLabel(header.label) ?? historyOperationLabel(op);
  const names = (Array.isArray(header.proposal_ids) ? header.proposal_ids : []).flatMap(proposalId => {
    if (typeof proposalId !== "string" || !isSafeProposalId(proposalId)) return [];
    try {
      const p = JSON.parse(fs.readFileSync(projectProposalPath(projectId, proposalId), "utf8"));
      return typeof p.proposal?.summary === "string" ? [p.proposal.summary] : [];
    } catch { return []; }
  });
  if (names.length && (op.startsWith("editor_agent_") || (op === "history_restore" && action))) label = `Apply: ${names.join("; ")}`;
  if (action) label = historyActionLabel(action, label.replace(/^Apply: /, "Apply "));
  else if (op === "history_restore" && !header.label) label = legacyRestoreLabel(header.restores_snapshot_id);
  return label;
}

/** Read only the small header; old snapshots can contain very large timelines. */
export function listHistoryPage(projectId: string, before?: string) {
  assertProject(projectId);
  const dir = projectHistoryDir(projectId);
  const allIds = (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    .filter(id => /^\d{4}-.*\.json$/.test(id) && !id.endsWith("_before.json"))
    .sort().reverse();
  const ids = allIds.filter(id => !before || id < before);
  const page = ids.slice(0, 40);
  const entries = page.map(id => {
    const fd = fs.openSync(path.join(dir, id), "r");
    let header: Record<string, unknown> = {};
    try {
      const buffer = Buffer.alloc(65536);
      const text = buffer.subarray(0, fs.readSync(fd, buffer, 0, buffer.length, 0)).toString();
      const end = text.indexOf('"timeline"');
      if (end > 0) header = JSON.parse(text.slice(0, end).replace(/,\s*$/, "") + "}");
    } catch { /* Legacy headers still have a meaningful operation in their filename. */ }
    finally { fs.closeSync(fd); }
    const op = typeof header.op === "string" ? header.op : id.slice(25, -5);
    const action = parseHistoryAction(header.history_action);
    const label = snapshotLabel(projectId, header, op);
    const actor = header.actor === "agent" ? "Agent" : header.actor === "human" ? "You" : "System";
    return { id, label, actor, version: allIds.length - allIds.indexOf(id), current: id === allIds[0], kind: op.startsWith("frame_tag") ? "Review mark" : op === "history_restore" || action ? "History" : "Edit", at: typeof header.at === "string" ? header.at : null };
  });
  return { entries, next: ids.length > page.length ? page.at(-1) : null };
}
