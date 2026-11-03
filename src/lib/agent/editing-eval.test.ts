import assert from "node:assert/strict";
import test from "node:test";
import { editingEvalCases, editingEvalPacket, gradeEditingProposal } from "./editing-eval";

// Known solutions are evaluator-only; packet() never exposes these.
function solution(id: string) {
  const packet = editingEvalPacket(id);
  const speech = packet.timeline.elements[0].id;
  const music = packet.timeline.elements[1].id;
  const answers: Record<string, { target: string; patch: Record<string, number> }> = {
    "mute-speech": { target: speech, patch: { volume: 0 } },
    "lower-music": { target: music, patch: { volume: 0.2 } },
    "music-fades": { target: music, patch: { fade_in: 0.5, fade_out: 1 } },
    "music-level-and-fades": { target: music, patch: { volume: 0.2, fade_in: 0.5, fade_out: 1 } },
  };
  const answer = answers[id];
  const count = answer ? Object.keys(answer.patch).length : 0;
  return { schema_version: 2, project_id: packet.project_id, expected_revision: packet.expected_revision,
    mode: "workshop", decision: answer ? "propose" : "no_change", summary: "Synthetic reference", assumptions: [], unresolved_gaps: [],
    caps: { max_mutations: 3, requested_mutations: count, max_renders: 0 },
    options: answer ? [{ id: "only", label: "Audio adjustment", recommended: true, summary: "Requested audio adjustment",
      requested_mutations: count, operations: [{ element_id: answer.target, patch: answer.patch }],
      review_controls: Object.keys(answer.patch).map(field => ({ operation_index: 0, target: "patch", field })) }] : [] };
}

for (const { id } of editingEvalCases()) test(`known solution passes ${id}`, () => {
  const result = gradeEditingProposal(id, solution(id));
  assert.equal(result.pass, true, JSON.stringify(result));
});
test("wrong target and wrong value cannot pass a valid schema", () => {
  const wrongTarget = solution("lower-music");
  wrongTarget.options[0].operations[0].element_id = editingEvalPacket("lower-music").timeline.elements[0].id;
  assert.equal(gradeEditingProposal("lower-music", wrongTarget).pass, false);
  const wrongValue = solution("lower-music");
  wrongValue.options[0].operations[0].patch.volume = 0.3;
  assert.equal(gradeEditingProposal("lower-music", wrongValue).pass, false);
});
test("extra changes, omitted dials, stale state, invalid payload, and no-op edits fail", () => {
  const extra = solution("lower-music");
  extra.options[0].operations[0].patch.fade_in = 0.5;
  extra.options[0].requested_mutations = extra.caps.requested_mutations = 2;
  assert.equal(gradeEditingProposal("lower-music", extra).pass, false);
  const noControls = solution("music-fades"); noControls.options[0].review_controls = [];
  assert.equal(gradeEditingProposal("music-fades", noControls).pass, false);
  const stale = solution("mute-speech"); stale.expected_revision = "0".repeat(64);
  assert.equal(gradeEditingProposal("mute-speech", stale).pass, false);
  assert.equal(gradeEditingProposal("mute-speech", {}).pass, false);
  const noop = solution("mute-speech"); noop.expected_revision = editingEvalPacket("already-muted").expected_revision;
  assert.equal(gradeEditingProposal("already-muted", noop).pass, false);
});
test("unsupported production operations are rejected before derivation", () => {
  const draft = solution("lower-music");
  (draft.options[0].operations[0] as unknown as Record<string, unknown>).props = { opacity: 0.5 };
  draft.options[0].requested_mutations = draft.caps.requested_mutations = 2;
  assert.equal(gradeEditingProposal("lower-music", draft).pass, false);
});
test("packet is reproducible, independent, and contains no reference answer", () => {
  const packet = editingEvalPacket("lower-music");
  assert.deepEqual(packet, editingEvalPacket("lower-music"));
  packet.timeline.elements[0].volume = 100;
  assert.equal(editingEvalPacket("lower-music").timeline.elements[0].volume, 1);
  assert.equal("patch" in packet, false);
});
