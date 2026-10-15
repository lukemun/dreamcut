import assert from "node:assert/strict";
import test from "node:test";

import { MOTION_RENDER_FIELD, applyProposalNumericOverrides } from "./proposal-overrides";
import type { EditorAgentOption } from "./timeline-editor-agent-apply";

const base = "/api/projects/demo/media/hyperframes/logo-sting/";
const option = {
  id: "a",
  label: "Logo sting",
  recommended: true,
  summary: "Add the logo sting",
  requested_mutations: 1,
  operations: [{
    element_id: "6f1c1f62-4f36-4a8e-9a49-6f6f0f4c2a11",
    create_visual: {
      type: "video_clip",
      source_url: `${base}logo-sting.aaaaaaaaaaaaaaaa.webm`,
      timeline_start: 0,
      lane_key: "v2",
      lane_index: 1,
      source_start_seconds: 0,
      source_end_seconds: 4.6,
      source_duration_seconds: 4.6,
      has_alpha: true,
    },
  }],
} as unknown as EditorAgentOption;

const swap = (value: string) => applyProposalNumericOverrides(option, [
  { operation_index: 0, target: "create_visual", field: MOTION_RENDER_FIELD, value },
]);

test("a creator's control change swaps in another render of the same motion graphic", () => {
  const next = swap(`${base}logo-sting.bbbbbbbbbbbbbbbb.webm`);
  assert.equal(next.operations[0]!.create_visual!.source_url, `${base}logo-sting.bbbbbbbbbbbbbbbb.webm`);
  assert.equal(option.operations[0]!.create_visual!.source_url, `${base}logo-sting.aaaaaaaaaaaaaaaa.webm`);
});

test("rejects renders of another composition, another project or an arbitrary file", () => {
  for (const value of [
    "/api/projects/demo/media/hyperframes/other/other.bbbbbbbbbbbbbbbb.webm",
    "/api/projects/elsewhere/media/hyperframes/logo-sting/logo-sting.bbbbbbbbbbbbbbbb.webm",
    `${base}evil.webm`,
    "/api/projects/demo/media/sources/clip.mp4",
  ]) {
    assert.throws(() => swap(value), /same motion graphic/, value);
  }
});

test("a dial change on a swapped clip re-points that clip's patch to the new render", () => {
  const base = "/api/projects/p/media/hyperframes/section-header/section-header.";
  const option = { id: "o", label: "Notebook", recommended: true, summary: "s", requested_mutations: 2,
    operations: [
      { element_id: "11111111-1111-4111-8111-111111111111", patch: { source_url: `${base}aaaaaaaaaaaaaaaa.webm` } },
      { element_id: "22222222-2222-4222-8222-222222222222", patch: { source_url: `${base}bbbbbbbbbbbbbbbb.webm` } },
    ] } as unknown as EditorAgentOption;
  const tuned = applyProposalNumericOverrides(option, [{ operation_index: 1, target: "patch", field: MOTION_RENDER_FIELD, value: `${base}cccccccccccccccc.webm` }]);
  assert.equal(tuned.operations[1]!.patch!.source_url, `${base}cccccccccccccccc.webm`);
  assert.equal(tuned.operations[0]!.patch!.source_url, `${base}aaaaaaaaaaaaaaaa.webm`, "the other card is untouched");
  assert.throws(() => applyProposalNumericOverrides(option, [{ operation_index: 1, target: "patch", field: MOTION_RENDER_FIELD, value: "/api/projects/p/media/hyperframes/other/other.cccccccccccccccc.webm" }]), /same motion graphic/);
});
