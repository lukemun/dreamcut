import test from "node:test";
import assert from "node:assert/strict";
import { proposalRevisionPresentation, proposalRevisionAncestors } from "./proposal-revisions";

const draft = (id: string, replaces: string[] = [], status = "pending", stale = false) => ({
  proposal_id: id, created_at: id, summary: `Draft ${id}`, supersedes_proposal_ids: replaces, status, stale,
});
test("revision folds its predecessor without changing persisted status", () => {
  const rows = proposalRevisionPresentation([draft("1"), draft("2", ["1"]), draft("3")]);
  assert.equal(rows[0].replaced_by_pending_proposal_id, "2");
  assert.equal(rows[0].status, "pending");
  assert.deepEqual(rows[1].previous_drafts, [{ proposal_id: "1", summary: "Draft 1" }]);
  assert.equal(rows[2].replaced_by_pending_proposal_id, null);
});
test("rejected or stale successors do not hide an earlier draft", () => {
  for (const successor of [draft("2", ["1"], "rejected"), draft("2", ["1"], "pending", true)]) {
    assert.equal(proposalRevisionPresentation([draft("1"), successor])[0].replaced_by_pending_proposal_id, null);
  }
});
test("a broken successor still hides earlier drafts that are broken too, so one card needs repair", () => {
  const rows = proposalRevisionPresentation([draft("1", [], "pending", true), draft("2", ["1"], "pending", true)]);
  assert.equal(rows[0].replaced_by_pending_proposal_id, "2");
});
test("revision chains fold all predecessors; malformed backward links cannot hide the newest", () => {
  const rows = proposalRevisionPresentation([draft("1", ["3"]), draft("2", ["1"]), draft("3", ["2"])]);
  assert.deepEqual(rows.map(r => r.replaced_by_pending_proposal_id), ["2", "3", null]);
});

test("approved successor retires the complete legacy chain through resolved intermediate drafts", () => {
  const entries = [draft("1", [], "pending", true), draft("2", ["1"], "rejected"), draft("3", ["2"], "approved"), draft("4", [], "pending", true)];
  const rows = proposalRevisionPresentation(entries);
  assert.deepEqual(proposalRevisionAncestors(entries, "3").map(x => x.proposal_id), ["2", "1"]);
  assert.equal(rows[0].replaced_by_approved_proposal_id, "3");
  assert.equal(rows[1].replaced_by_approved_proposal_id, "3");
  assert.equal(rows[3].replaced_by_approved_proposal_id, null);
  assert.equal(entries[0].status, "pending", "read-time classification must not mutate legacy records");
  const undone = proposalRevisionPresentation(entries.map(x => x.proposal_id === "3" ? {...x, status:"pending", stale:true} : x));
  assert.equal(undone[0].replaced_by_approved_proposal_id, null);
});

test("ancestry ignores missing, duplicate, cyclic and forward links", () => {
  const entries = [draft("1", ["3"]), draft("2", ["1", "1", "missing"]), draft("3", ["2"])];
  assert.deepEqual(proposalRevisionAncestors(entries, "3").map(x => x.proposal_id), ["2", "1"]);
});
