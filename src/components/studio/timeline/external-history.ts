import type { SnapshotHistoryEntry } from "./useTimelineHistory";

export type ProjectHistoryDescriptor = { id: string; op: string; at: string };

export function buildExternalSnapshotHistoryEntry(
  before: ProjectHistoryDescriptor | null,
  after: ProjectHistoryDescriptor | null,
): SnapshotHistoryEntry | null {
  if (!before || !after || before.id === after.id) return null;
  return {
    type: "snapshot",
    beforeSnapshotId: before.id,
    afterSnapshotId: after.id,
    label: after.op.startsWith("editor_agent_") ? "agent edit" : after.op.replaceAll("_", " "),
  };
}
