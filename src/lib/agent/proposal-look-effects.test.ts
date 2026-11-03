import assert from "node:assert/strict";
import test from "node:test";
import { countOperationMutations, deriveProposalTimeline, editorAgentOptionSchema } from "./timeline-editor-agent-apply";
import { applyProposalNumericOverrides } from "./proposal-overrides";
import { proposalControlInventory } from "./proposal-control-inventory";
import { resolveGradientMapAtTime } from "../timeline/gradient-map";
import { resolveGlitchAtTime } from "../timeline/glitch";
import type { TimelineFile } from "../local-store/store";

const id = "00000000-0000-4000-8000-000000000041";
const timeline = { elements: [{ id, project_id: "fixture", type: "still", source_url: "/synthetic.png", timeline_start: 0, duration: 2, props: {}, lane_key: "visual_0", lane_index: 0, removed_at: null }], transitions: [] } as unknown as TimelineFile;
const option = (props: Record<string, unknown>, review_controls: unknown[] = []) => editorAgentOptionSchema.parse({ id: "look", label: "Look", summary: "Look", recommended: true, requested_mutations: Object.keys(props).length, operations: [{ element_id: id, props }], review_controls });

test("a proposal keys a two-frame thermal flash and a glitch burst on one clip", () => {
  const hold = (beat: number, frames: number, peak: number) => [{ t: 0, v: 0, ease: "hold" }, { t: beat, v: peak, ease: "hold" }, { t: beat + frames / 30, v: 0, ease: "hold" }];
  const parsed = option({ gradient_map_amount: 0, glitch_amount: 0, transition_keyframes: { gradient_map_amount: hold(0.5, 2, 1), glitch_amount: hold(1, 4, 0.8) } });
  const props = deriveProposalTimeline(timeline, parsed.operations, "fixture").timeline.elements[0].props!;
  assert.equal(resolveGradientMapAtTime(props, 14 / 30), null);
  assert.equal(resolveGradientMapAtTime(props, 15 / 30)!.amount, 1);
  assert.equal(resolveGradientMapAtTime(props, 17 / 30), null);
  assert.equal(resolveGlitchAtTime(props, 29 / 30), null);
  assert.equal(resolveGlitchAtTime(props, 32 / 30)!.amount, 0.8);
  assert.equal(resolveGlitchAtTime(props, 34 / 30), null);
});

test("color map colours are proposal colour dials and glitch numbers are sliders", () => {
  const parsed = option({ gradient_map_amount: 1, gradient_map_shadows: "#5a0000", glitch_amount: 0.6, glitch_shift: 0.12 }, [
    { operation_index: 0, target: "props", field: "gradient_map_amount" },
    { operation_index: 0, target: "props", field: "gradient_map_shadows" },
    { operation_index: 0, target: "props", field: "glitch_amount" },
  ]);
  const controls = proposalControlInventory(timeline, parsed)[0].controls;
  assert.equal(controls.find(control => control.field === "gradient_map_shadows")?.kind, "color");
  assert.deepEqual(controls.find(control => control.field === "glitch_amount")?.display, { min: 0, max: 100, step: 1, suffix: "%" });
  assert.equal(controls.find(control => control.field === "glitch_shift")?.tier, "advanced");
  const tuned = applyProposalNumericOverrides(parsed, [{ operation_index: 0, target: "props", field: "gradient_map_shadows", value: "#001144" }]);
  assert.equal(tuned.operations[0].props!.gradient_map_shadows, "#001144");
  assert.throws(() => applyProposalNumericOverrides(parsed, [{ operation_index: 0, target: "props", field: "glitch_amount", value: 2 }]));
});

test("create_visual carries the look props onto the new clip", () => {
  const operations = [{ element_id: "00000000-0000-4000-8000-000000000042",
    create_visual: { type: "still" as const, source_url: "/api/projects/fixture/media/synthetic.png", timeline_start: 0, duration_seconds: 1, lane_key: "visual_1", lane_index: 1, gradient_map_amount: 1, gradient_map_highlights: "#ffffff", glitch_amount: 0.5, glitch_seed: 9 } }];
  const parsed = editorAgentOptionSchema.parse({ id: "new", label: "New", summary: "New", recommended: true, requested_mutations: countOperationMutations(operations as never), operations });
  const created = deriveProposalTimeline(timeline, parsed.operations, "fixture").timeline.elements.find(element => element.id === "00000000-0000-4000-8000-000000000042")!;
  assert.equal(created.props!.gradient_map_highlights, "#ffffff");
  assert.equal(resolveGlitchAtTime(created.props, 0)!.seed, 9);
  assert.throws(() => editorAgentOptionSchema.parse({ id: "bad", label: "Bad", summary: "Bad", recommended: true, requested_mutations: 1, operations: [{ element_id: id, props: { glitch_rgb_split: 90 } }] }));
});
