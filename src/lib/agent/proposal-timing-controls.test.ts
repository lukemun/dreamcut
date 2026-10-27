import assert from "node:assert/strict";
import test from "node:test";
import { editorAgentOptionSchema, countOperationMutations } from "./timeline-editor-agent-apply";
import { applyProposalNumericOverrides } from "./proposal-overrides";
import { reviewOption } from "./proposal-review";
import { proposalControlInventory } from "./proposal-control-inventory";
import { assertHoldControlSources, timingValue } from "./proposal-timing-controls";
import { proposalTunableField } from "./proposal-controls";

const operations = [
  { element_id: "00000000-0000-4000-8000-000000000001", patch: { timeline_start: 10.5, duration: 0.7 } },
  { element_id: "00000000-0000-4000-8000-000000000002", patch: { timeline_start: 10.5 - 1 / 30 } },
  { element_id: "00000000-0000-4000-8000-000000000003", patch: { timeline_start: 11.2, duration: 1.8 } },
];
const control = { id: "reveals", spacing_seconds: 0.5, bindings: [
  { operation_index: 0, target: "patch" as const, field: "timeline_start" as const, offset_seconds: 10, spacing_multiplier: 1 },
  { operation_index: 0, target: "patch" as const, field: "duration" as const, offset_seconds: 10, spacing_multiplier: 2.4, subtract_offset_seconds: 10, subtract_spacing_multiplier: 1 },
  { operation_index: 1, target: "patch" as const, field: "timeline_start" as const, offset_seconds: 10 - 1 / 30, spacing_multiplier: 1 },
  { operation_index: 2, target: "patch" as const, field: "timeline_start" as const, offset_seconds: 10, spacing_multiplier: 2.4 },
  { operation_index: 2, target: "patch" as const, field: "duration" as const, offset_seconds: 13, spacing_multiplier: 0, subtract_offset_seconds: 10, subtract_spacing_multiplier: 2.4 },
] };
const draft = { id: "spacing", label: "Spacing", recommended: true, summary: "Spacing", requested_mutations: countOperationMutations(operations), operations, timing_controls: [control], review_controls: [{ operation_index: 0, target: "timing_control" as const, field: "spacing_seconds" }] };

test("shared seconds hold preserves unequal pacing and independent Advanced overrides", () => {
  const ops = [
    {element_id: operations[0].element_id, patch: {timeline_start: 0, duration: .2}},
    {element_id: operations[1].element_id, patch: {timeline_start: .2, duration: 1.4}},
    {element_id: operations[2].element_id, patch: {timeline_start: 1.6}},
  ];
  const member = (id: string, index: number, duration: number, max: number) => ({id, kind: "hold", display_unit: "seconds", reference_seconds: duration, spacing_seconds: duration, min_spacing_seconds: duration, max_spacing_seconds: max, bindings: [
    {operation_index: index, target: "patch", field: "duration", offset_seconds: duration, spacing_multiplier: 1},
    ...ops.flatMap((op, i) => i > index ? [{operation_index: i, target: "patch", field: "timeline_start", offset_seconds: op.patch.timeline_start, spacing_multiplier: 1}] : []),
  ]});
  const option = editorAgentOptionSchema.parse({...draft, operations: ops, requested_mutations: countOperationMutations(ops), timing_controls: [member("first", 0, .2, 1), member("last", 1, 1.4, 2.4),
    {id: "all", kind: "hold", label: "All images", display_unit: "seconds", reference_seconds: .2, spacing_seconds: .2, min_spacing_seconds: .2, max_spacing_seconds: 1, bindings: [], member_control_ids: ["first", "last"]}],
    review_controls: [{operation_index: 2, target: "timing_control", field: "spacing_seconds"}]});
  const shared = {operation_index: 2, target: "timing_control" as const, field: "spacing_seconds", value: .5};
  const independent = {operation_index: 1, target: "timing_control" as const, field: "spacing_seconds", value: 2};
  const tuned = applyProposalNumericOverrides(option, [shared]);
  assert.equal(tuned.operations[0].patch?.duration, .5);
  assert.equal(tuned.operations[1].patch?.duration, 1.7);
  assert.ok(Math.abs(tuned.operations[2].patch!.timeline_start! - 2.2) < 1e-8);
  const individual = applyProposalNumericOverrides(option, [shared, independent]);
  assert.deepEqual(individual, applyProposalNumericOverrides(option, [independent, shared]));
  assert.equal(individual.operations[1].patch?.duration, 2);
  assert.ok(Math.abs(individual.operations[2].patch!.timeline_start! - 2.5) < 1e-8);
  assert.equal(applyProposalNumericOverrides(option, [independent]).operations[0].patch?.duration, .2, "resetting the group leaves an explicit individual choice");
  assert.deepEqual(applyProposalNumericOverrides(option, []), option);
  const inventory = proposalControlInventory({schema_version: 1, elements: [], transitions: []}, option).filter(row => row.element_id.startsWith("timing:"));
  assert.deepEqual(inventory.map(row => row.controls[0].tier), ["advanced", "advanced", "main"]);
  assert.deepEqual(inventory[2].controls[0].display, {min: .2, max: 1, step: .01, suffix: "s"});
  assert.equal(reviewOption({schema_version: 1, elements: [], transitions: []}, option).rows.find(row => row.element_id === "timing:last")!.changes[0].control_group?.offset_seconds, 1.2);
  assert.equal(editorAgentOptionSchema.safeParse({...option, timing_controls: [...option.timing_controls!.slice(0, 2), {...option.timing_controls![2], max_spacing_seconds: 1.1}]}).success, false, "group bounds cannot exceed a member's real range");
  assert.equal(editorAgentOptionSchema.safeParse({...option, timing_controls: [...option.timing_controls!.slice(0, 2), {...option.timing_controls![2], member_control_ids: ["all", "last"]}]}).success, false, "groups cannot contain themselves");
});

test("frame-based image hold inventory keeps units, source bounds and transition actors separate", () => {
  const ops = [
    {element_id: "10000000-0000-4000-8000-000000000001", create_transition: {from_element_id: operations[0].element_id, to_element_id: operations[1].element_id, type: "fade", duration_seconds: 4 / 30}},
    {element_id: operations[0].element_id, patch: {timeline_start: 0, duration: .2, trim_start: .5, trim_end: 3.3}},
    {element_id: operations[1].element_id, patch: {timeline_start: .2}},
  ];
  const hold = {id: "image-hold", kind: "hold", label: "Image hold", display_unit: "frames", reference_seconds: .2, spacing_seconds: .2, min_spacing_seconds: .2, max_spacing_seconds: 1, bindings: [
    {operation_index: 1, target: "patch", field: "duration", offset_seconds: .2, spacing_multiplier: 1, source_tail: {source_duration_seconds: 4, trim_start: .5, playback_rate: 1}},
    {operation_index: 2, target: "patch", field: "timeline_start", offset_seconds: .2, spacing_multiplier: 1},
  ]};
  const option = editorAgentOptionSchema.parse({...draft, operations: ops, requested_mutations: countOperationMutations(ops as never), preview_range: {start_seconds: 0, end_seconds: .4}, timing_controls: [hold], review_controls: [{operation_index: 0, target: "timing_control", field: "spacing_seconds"}]});
  const empty = {schema_version: 1, elements: [], transitions: []};
  const inventory = proposalControlInventory(empty, option).find(row => row.element_id === "timing:image-hold")!;
  assert.equal(inventory.controls.length, 1, "timing-control index must not borrow transition operation defaults");
  assert.deepEqual(inventory.controls[0].display, {min: 6, max: 30, step: 1, suffix: "frames"});
  assert.equal(inventory.controls[0].display_value, 6);
  const spec = proposalTunableField("timing_control", "spacing_seconds", {min: .2, max: 1}, "frames")!;
  const tuned = applyProposalNumericOverrides(option, [{operation_index: 0, target: "timing_control", field: "spacing_seconds", value: spec.fromDisplay!(15)}]);
  assert.equal(tuned.operations[1].patch?.duration, .5);
  assert.equal(tuned.operations[1].patch?.trim_end, 3);
  assert.equal(tuned.operations[2].patch?.timeline_start, .5);
  assert.equal(tuned.operations[0].create_transition?.duration_seconds, 4 / 30);
  assert.ok(Math.abs(tuned.preview_range!.end_seconds - .7) < 1e-8, "replay includes the extended hold and its original context padding");
  assert.deepEqual(applyProposalNumericOverrides(option, []), option);
});

test("eleven independent timing dials preserve cumulative delays and unchanged earlier entrances", () => {
  const operations = Array.from({ length: 12 }, (_, i) => ({
    element_id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    patch: { timeline_start: 1 + i * 0.4 },
  }));
  const timing_controls = Array.from({ length: 11 }, (_, i) => ({
    id: `gap-${i}`, kind: "hold" as const, reference_seconds: 0.4, spacing_seconds: 0.4,
    min_spacing_seconds: 0.2, max_spacing_seconds: 0.8,
    bindings: operations.flatMap((op, j) => j > i ? [{ operation_index: j, target: "patch" as const,
      field: "timeline_start" as const, offset_seconds: op.patch.timeline_start, spacing_multiplier: 1 }] : []),
  }));
  const option = editorAgentOptionSchema.parse({ ...draft, operations, timing_controls,
    requested_mutations: countOperationMutations(operations),
    review_controls: timing_controls.map((_, operation_index) => ({ operation_index, target: "timing_control", field: "spacing_seconds" })),
  });
  const overrides = [2, 7].map(operation_index => ({ operation_index, target: "timing_control" as const, field: "spacing_seconds", value: 0.8 }));
  const tuned = applyProposalNumericOverrides(option, overrides);
  assert.deepEqual(tuned, applyProposalNumericOverrides(option, overrides.toReversed()));
  tuned.operations.forEach((op, i) => assert.ok(Math.abs(op.patch!.timeline_start! -
    (operations[i].patch.timeline_start + (i > 2 ? 0.4 : 0) + (i > 7 ? 0.4 : 0))) < 1e-8));
  assert.deepEqual(applyProposalNumericOverrides(option, []), option);
  assert.equal(proposalControlInventory({ schema_version: 1, elements: [], transitions: [] }, option).filter(row => row.controls.some(c => c.selected)).length, 11);
});

test("spacing derives masks, holds and clicks together and preserves the immutable draft", () => {
  const option = editorAgentOptionSchema.parse(draft);
  for (const value of Array.from({ length: 101 }, (_, i) => (20 + i) / 100)) {
    const tuned = applyProposalNumericOverrides(option, [{ operation_index: 0, target: "timing_control", field: "spacing_seconds", value }]);
    const [mask, click, scene] = tuned.operations.map(op => op.patch!);
    assert.ok(Math.abs(mask.timeline_start! - click.timeline_start! - 1 / 30) < 1e-8);
    assert.ok(Math.abs(mask.timeline_start! + mask.duration! - scene.timeline_start!) < 1e-8);
    assert.equal(scene.timeline_start! + scene.duration!, 13);
    for (const binding of control.bindings) assert.equal(tuned.operations[binding.operation_index].patch?.[binding.field as "timeline_start" | "duration"], timingValue(binding, value));
  }
  assert.equal(option.timing_controls![0].spacing_seconds, 0.5);
  assert.deepEqual(option.operations, operations);
});

test("spacing fails closed for absent fields, collisions, invalid ranges and independently tunable children", () => {
  assert.equal(editorAgentOptionSchema.safeParse({ ...draft, timing_controls: [{ ...control, bindings: [{ ...control.bindings[0], operation_index: 9 }] }] }).success, false);
  assert.equal(editorAgentOptionSchema.safeParse({ ...draft, timing_controls: [{ ...control, bindings: [...control.bindings, control.bindings[0]] }] }).success, false);
  assert.equal(editorAgentOptionSchema.safeParse({ ...draft, timing_controls: [{ ...control, spacing_seconds: 0.7 }] }).success, false);
  assert.equal(editorAgentOptionSchema.safeParse({ ...draft, timing_controls: [{ ...control, bindings: [{ ...control.bindings[0], field: "duration", spacing_multiplier: -1 }] }] }).success, false);
  const option = editorAgentOptionSchema.parse(draft);
  for (const value of [0.1, 1.3, "0.5"]) assert.throws(() => applyProposalNumericOverrides(option, [{ operation_index: 0, target: "timing_control", field: "spacing_seconds", value }]));
  const override = { operation_index: 0, target: "timing_control" as const, field: "spacing_seconds", value: 0.7 };
  assert.throws(() => applyProposalNumericOverrides(option, [override, override]));
});

test("review and preflight expose one spacing dial with the same override contract", () => {
  const option = editorAgentOptionSchema.parse(draft);
  const timeline = { schema_version: 1, elements: [], transitions: [] };
  const row = reviewOption(timeline, option).rows.at(-1)!;
  assert.equal(row.changes[0].target, "timing_control");
  assert.equal(row.changes[0].after_value, 0.5);
  const dial = proposalControlInventory(timeline, option).at(-1)!.controls[0];
  assert.equal(dial.selected, true);
  assert.equal(dial.label, "Spacing");
  assert.equal(dial.display?.max, 1.2);
});

test("bounded spacing uses the same limits for validation, overrides and review controls", () => {
  const bounded = { ...draft, timing_controls: [{ ...control, min_spacing_seconds: 0.25, max_spacing_seconds: 0.4 }] };
  bounded.timing_controls[0].spacing_seconds = 0.3;
  bounded.operations = structuredClone(operations);
  for (const binding of control.bindings) bounded.operations[binding.operation_index].patch[binding.field] = timingValue(binding, 0.3);
  const option = editorAgentOptionSchema.parse(bounded);
  const timeline = { schema_version: 1, elements: [], transitions: [] };
  assert.deepEqual(reviewOption(timeline, option).rows.at(-1)!.changes[0].control_range, { min: 0.25, max: 0.4 });
  assert.equal(proposalControlInventory(timeline, option).at(-1)!.controls[0].display?.max, 0.4);
  for (const value of [0.25, 0.3, 0.4]) assert.doesNotThrow(() => applyProposalNumericOverrides(option, [{ operation_index: 0, target: "timing_control", field: "spacing_seconds", value }]));
  for (const value of [0.24, 0.41]) assert.throws(() => applyProposalNumericOverrides(option, [{ operation_index: 0, target: "timing_control", field: "spacing_seconds", value }]));
  assert.equal(editorAgentOptionSchema.safeParse({ ...bounded, timing_controls: [{ ...bounded.timing_controls[0], max_spacing_seconds: 0.25 }] }).success, false);
});

test("independent hold dials compose downstream timing and source-tail trims in any order", () => {
  const operations = [
    { element_id: "00000000-0000-4000-8000-000000000001", patch: { timeline_start: 10, duration: 0.8, trim_start: 2, trim_end: 6.4 } },
    { element_id: "00000000-0000-4000-8000-000000000002", patch: { timeline_start: 10.4 } },
    { element_id: "00000000-0000-4000-8000-000000000003", patch: { timeline_start: 10.4 - 1 / 30 } },
  ];
  const bindings = [1, 2].map(operation_index => ({ operation_index, target: "patch" as const, field: "timeline_start" as const, offset_seconds: operations[operation_index].patch.timeline_start, spacing_multiplier: 1 }));
  const holds = [
    { id: "stat", kind: "hold" as const, label: "Stat sheet extra hold", reference_seconds: 0.2, spacing_seconds: 0.2, min_spacing_seconds: 0, max_spacing_seconds: 0.7, bindings: [
      { operation_index: 0, target: "patch" as const, field: "timeline_start" as const, offset_seconds: 10, spacing_multiplier: 1 }, ...bindings,
    ] },
    { id: "street", kind: "hold" as const, label: "Street hold", reference_seconds: 0.4, spacing_seconds: 0.4, min_spacing_seconds: 0.2, max_spacing_seconds: 1, bindings: [
      { operation_index: 0, target: "patch" as const, field: "duration" as const, offset_seconds: 0.8, spacing_multiplier: 1, source_tail: { source_duration_seconds: 10, trim_start: 2, playback_rate: 2 } }, ...bindings,
    ] },
  ];
  const option = editorAgentOptionSchema.parse({ ...draft, operations, requested_mutations: countOperationMutations(operations), timing_controls: holds, review_controls: holds.map((_, operation_index) => ({ operation_index, target: "timing_control", field: "spacing_seconds" })) });
  const overrides = [{ operation_index: 0, target: "timing_control" as const, field: "spacing_seconds", value: 0.5 }, { operation_index: 1, target: "timing_control" as const, field: "spacing_seconds", value: 0.8 }];
  const tuned = applyProposalNumericOverrides(option, overrides);
  assert.deepEqual(tuned, applyProposalNumericOverrides(option, overrides.toReversed()));
  assert.ok(Math.abs(tuned.operations[0].patch!.duration! - 1.2) < 1e-8);
  assert.ok(Math.abs(tuned.operations[0].patch!.trim_end! - 5.6) < 1e-8);
  assert.ok(Math.abs(tuned.operations[1].patch!.timeline_start! - 11.1) < 1e-8);
  assert.ok(Math.abs(tuned.operations[1].patch!.timeline_start! - tuned.operations[2].patch!.timeline_start! - 1 / 30) < 1e-8);
  assert.equal(option.operations[0].patch!.trim_end, 6.4);
  assert.equal(proposalControlInventory({ schema_version: 1, elements: [], transitions: [] }, option).at(-1)!.controls[0].label, "Street hold");
  const source = { id: operations[0].element_id, trim_start: 2, playback_rate: 2, props: { source_duration_seconds: 10 } };
  assert.doesNotThrow(() => assertHoldControlSources(option, [source]));
  assert.throws(() => assertHoldControlSources(option, [{ ...source, playback_rate: 3 }]), /unchanged scalar/);
  assert.throws(() => assertHoldControlSources(option, [{ ...source, props: { ...source.props, keyframes: { playback_rate: [] } } }]), /speed-keyframed/);
  for (const stat of [0, 0.7]) for (const street of [0.2, 1]) assert.doesNotThrow(() => applyProposalNumericOverrides(option, [{ ...overrides[0], value: stat }, { ...overrides[1], value: street }]));
  const bad = structuredClone(option);
  bad.timing_controls![1].bindings[0].source_tail!.source_duration_seconds = 1;
  assert.equal(editorAgentOptionSchema.safeParse(bad).success, false);
  bad.timing_controls![1].bindings[0].source_tail!.source_duration_seconds = 10;
  bad.timing_controls![1].bindings[1].offset_seconds += 0.1;
  assert.equal(editorAgentOptionSchema.safeParse(bad).success, false);
});

test("moving hold dials reveal handled source frames and recompile the entrance without changing other cats", () => {
  const operations = [0, 1].map(i => ({
    element_id: `00000000-0000-4000-8000-00000000000${i + 1}`,
    create_visual: { type: "video_clip" as const, source_url: "/api/projects/test/media/cat.webm", timeline_start: i / 2,
      source_duration_seconds: 4, source_start_seconds: 2, source_end_seconds: 3, playback_rate: 1,
      lane_key: `visual_${i}`, lane_index: i, subject_entrance_seconds: 0, subject_flash_seconds: 1 / 30,
      subject_glow_fade_seconds: 2 / 30, subject_flash: 1, subject_glow: 1.8, transition_keyframes: {} },
  }));
  const timing_controls = operations.map((_, operation_index) => ({ id: `cat${operation_index}`, kind: "hold" as const,
    label: `Cat ${operation_index + 1} duration`, reference_seconds: 1, spacing_seconds: 1,
    min_spacing_seconds: 0.2, max_spacing_seconds: 2,
    bindings: [{ operation_index, target: "create_visual" as const, field: "source_end_seconds" as const, offset_seconds: 3, spacing_multiplier: 1 }],
  }));
  const option = editorAgentOptionSchema.parse({ ...draft, operations, requested_mutations: countOperationMutations(operations), timing_controls,
    review_controls: timing_controls.map((_, operation_index) => ({ operation_index, target: "timing_control", field: "spacing_seconds" })) });
  for (const value of [0.2, 1, 2]) {
    const tuned = applyProposalNumericOverrides(option, [{ operation_index: 0, target: "timing_control", field: "spacing_seconds", value }]);
    const cat = tuned.operations[0].create_visual!;
    assert.equal(cat.source_end_seconds, 2 + value);
    assert.equal(cat.source_start_seconds, 2);
    assert.equal(cat.timeline_start, 0);
    assert.equal(tuned.operations[1].create_visual!.source_end_seconds, 3);
    assert.equal(cat.transition_keyframes!.media_opacity!.at(-1)!.t, value);
    assert.equal(cat.transition_keyframes!.subject_flash!.at(-1)!.v, 0);
  }
  assert.equal(option.operations[0].create_visual!.source_end_seconds, 3);
  assert.deepEqual(applyProposalNumericOverrides(option, []), option);
  for (const range of [{ min_spacing_seconds: 0 }, { max_spacing_seconds: 2.1 }]) {
    assert.equal(editorAgentOptionSchema.safeParse({ ...option, timing_controls: [{ ...timing_controls[0], ...range }, timing_controls[1]] }).success, false);
  }
  const wrongTarget = structuredClone(option);
  wrongTarget.timing_controls![0].bindings[0].target = "patch";
  assert.equal(editorAgentOptionSchema.safeParse(wrongTarget).success, false);
});
