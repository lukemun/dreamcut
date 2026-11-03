import assert from "node:assert/strict";
import test from "node:test";

import { parseProposalFile } from "@/lib/agent/proposal-file";

const proposal = {
  schema_version: 2, project_id: "p", expected_revision: "a".repeat(64), mode: "workshop", decision: "propose",
  summary: "Add a still.", assumptions: [], unresolved_gaps: [],
  caps: { max_mutations: 6, requested_mutations: 6, max_renders: 0 },
  options: [{ id: "o", label: "O", recommended: true, summary: "S", requested_mutations: 6, operations: [{
    element_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    create_visual: { type: "still", source_url: "/api/projects/p/media/still.png", timeline_start: 0, duration_seconds: 2, lane_key: "visual_1", lane_index: 1 },
  }] }],
};

test("a proposal file may hold the proposal or the stored record from proposals/", () => {
  assert.equal(parseProposalFile(proposal).project_id, "p");
  const stored = { schema_version: 1, proposal_id: "20261027T233358-e4974aaa", created_at: "2026-10-27T23:33:58.702Z", status: "pending", proposal, touched_fingerprints: {}, touched_base_values: {}, spatial_review: null };
  assert.equal(parseProposalFile(stored).options[0].id, "o");
  assert.throws(() => parseProposalFile({ ...proposal, extra: true }), /Unrecognized key/);
});
