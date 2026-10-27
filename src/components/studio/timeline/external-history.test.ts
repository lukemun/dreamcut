import assert from "node:assert/strict";
import test from "node:test";

import { buildExternalSnapshotHistoryEntry } from "./external-history";

test("agent snapshots become one undoable external history entry", () => {
  const entry = buildExternalSnapshotHistoryEntry(
    { id: "before.json", op: "element_patch", at: "before" },
    { id: "after.json", op: "editor_agent_workshop", at: "after" },
  );
  assert.deepEqual(entry, {
    type: "snapshot",
    beforeSnapshotId: "before.json",
    afterSnapshotId: "after.json",
    label: "agent edit",
  });
});

test("unchanged history ids do not create duplicate undo entries", () => {
  const descriptor = { id: "same.json", op: "element_patch", at: "now" };
  assert.equal(buildExternalSnapshotHistoryEntry(descriptor, descriptor), null);
});
