import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { EFFECT_CONTROLS, type EffectProposalNumber } from "../timeline/effect-controls";
import { PROPOSAL_TUNABLE_FIELDS, proposalTunableField, isSupportedProposalControl, proposalControlIsVisible } from "./proposal-controls";
import { LEGACY_UNBOUND_NUMERIC_PARAMETERS, PENDING_CONTROL_PARAMETERS, STRUCTURAL_NUMERIC_PARAMETERS, STRUCTURED_EFFECT_PROPOSAL_GAPS } from "./proposal-parameter-contract";
import { controlGaps, editorAgentPropsSchema, editorAgentCreateVisualSchema, editorAgentCreateTextSchema, editorAgentCreateAudioSchema, editorAgentOperationSchema, editorAgentOptionSchema, deriveProposalTimeline } from "./timeline-editor-agent-apply";
import { applyProposalNumericOverrides } from "./proposal-overrides";
import { proposalControlInventory } from "./proposal-control-inventory";
import { transitionParamsSchema, timelineTransitionCreateSchema, timelineTransitionPatchSchema } from "../timeline/contracts";
import { TRANSITION_CONTROLS, transitionControl } from "../timeline/transition-controls";
import { STRUCTURED_TRANSITION_PARAMETERS } from "./proposal-parameter-contract";
import { resolveSmearTransitionVisualStyle } from "../timeline/transitions";
import fs from "node:fs";
import type { TimelineFile } from "../local-store/store";
import { assertProposalControlBudget, proposalSliderCount } from "./proposal-control-budget";

test("every numeric effect declares display metadata and traverses inventory, tuning and derivation", () => {
  const elementId = "00000000-0000-4000-8000-000000000001";
  const timeline = { elements: [{ id: elementId, project_id: "fixture", type: "still", source_url: "/synthetic.png", timeline_start: 0, duration: 1, props: {}, lane_key: "visual_0", lane_index: 0, removed_at: null }], transitions: [] } as unknown as TimelineFile;
  for (const control of EFFECT_CONTROLS) {
    if (!control.agentWritable || control.kind !== "number") continue;
    const metadata: EffectProposalNumber = control.proposal;
    assert.ok(metadata && metadata.step > 0 && Number.isFinite(metadata.step), `${control.prop}: display step required`);
    assert.ok(Number.isFinite(metadata.scale ?? 1) && (metadata.scale ?? 1) > 0, `${control.prop}: invertible positive display scale required`);
    assert.ok(Number.isFinite(metadata.offset ?? 0));
    assert.equal(typeof metadata.suffix, "string");
    const spec = PROPOSAL_TUNABLE_FIELDS[control.prop];
    assert.ok(spec, `${control.prop} missing proposal control`);
    const option = editorAgentOptionSchema.parse({ id: "effect", label: "Effect", summary: "Effect", recommended: true, requested_mutations: 1, operations: [{ element_id: elementId, props: { [control.prop]: control.identity } }], review_controls: [{ operation_index: 0, target: "props", field: control.prop }] });
    assert.equal(proposalControlInventory(timeline, option)[0].controls[0].selected, true);
    for (const value of [control.min, control.identity, control.max]) {
      assert.ok(Math.abs(spec.fromDisplay!(spec.toDisplay!(value)) - value) < 1e-8);
      const tuned = applyProposalNumericOverrides(option, [{ operation_index: 0, target: "props", field: control.prop, value }]);
      assert.equal(tuned.operations[0].props![control.prop], value);
      const baseline = structuredClone(timeline);
      baseline.elements[0].props = { color_grade_model: "linear-srgb-v1", chroma_key_model: "color-key-v1", chroma_key_color: "#00ff00", [control.prop]: value === control.min ? value + 0.001 : value - 0.001 };
      const derived = deriveProposalTimeline(baseline, tuned.operations, "fixture");
      assert.equal(derived.timeline.elements[0].props![control.prop] ?? control.identity, value, control.prop);
    }
    assert.deepEqual(applyProposalNumericOverrides(option, []), option);
    assert.throws(() => applyProposalNumericOverrides(option, [{ operation_index: 0, target: "props", field: control.prop, value: control.max + 1 }]));
  }
});

test("every graph and wheel effect traverses inventory, list tuning, derivation and the control budget", () => {
  const elementId = "00000000-0000-4000-8000-000000000001";
  const timeline = { elements: [{ id: elementId, project_id: "fixture", type: "still", source_url: "/synthetic.png", timeline_start: 0, duration: 1, props: {}, lane_key: "visual_0", lane_index: 0, removed_at: null }], transitions: [] } as unknown as TimelineFile;
  const lists = EFFECT_CONTROLS.filter(control => control.agentWritable && control.kind === "list");
  assert.equal(lists.length, 20);
  for (const control of lists) {
    if (control.kind !== "list") continue;
    // A mid-range value at every position, whole points only.
    const tuned = control.itemBounds.slice(0, control.lengths.multiple).map(([min, max], index) => Number((min + (max - min) * (index % 2 ? 0.7 : 0.3)).toFixed(3)));
    const authored = control.lengths.min ? [...control.identity] : [0, 0, 1, 1].slice(0, control.lengths.multiple);
    const option = editorAgentOptionSchema.parse({ id: "list", label: "List", summary: "List", recommended: true, requested_mutations: 1, operations: [{ element_id: elementId, props: { [control.prop]: authored } }], review_controls: [{ operation_index: 0, target: "props", field: control.prop }] });
    const inventory = proposalControlInventory(timeline, option)[0].controls[0];
    assert.equal(inventory.kind, "graph", control.prop);
    assert.equal(inventory.selected, true, control.prop);
    assert.equal(proposalSliderCount(timeline, option), 1, `${control.prop} counts once toward the budget`);
    const applied = applyProposalNumericOverrides(option, [{ operation_index: 0, target: "props", field: control.prop, value: tuned }]);
    assert.deepEqual(applied.operations[0].props![control.prop], control.normalize(tuned), control.prop);
    const derived = deriveProposalTimeline(timeline, applied.operations, "fixture").timeline.elements[0].props!;
    assert.deepEqual(derived[control.prop], control.normalize(tuned), control.prop);
    assert.equal(derived.color_grade_model, "dreamcut-scene-v2");
    assert.throws(() => applyProposalNumericOverrides(option, [{ operation_index: 0, target: "props", field: "media_scale", value: tuned }]));
    assert.throws(() => editorAgentPropsSchema.parse({ [control.prop]: control.itemBounds.map(([, max]) => max + 1) }), control.prop);
  }
});

test("new scalar agent fields cannot silently miss the control contract", () => {
  const schemas = { props: editorAgentPropsSchema, create_visual: editorAgentCreateVisualSchema, create_text: editorAgentCreateTextSchema, create_audio: editorAgentCreateAudioSchema, patch: editorAgentOperationSchema.shape.patch.unwrap() };
  const seenGaps = new Set<string>();
  for (const [target, schema] of Object.entries(schemas)) for (const [field, definition] of Object.entries(schema.shape)) {
    let type: z.ZodType = definition;
    while (type instanceof z.ZodOptional || type instanceof z.ZodNullable || type instanceof z.ZodDefault) type = type.unwrap() as z.ZodType;
    if (!(type instanceof z.ZodNumber)) continue;
    if (PROPOSAL_TUNABLE_FIELDS[field] || STRUCTURAL_NUMERIC_PARAMETERS[field] || Object.hasOwn(PENDING_CONTROL_PARAMETERS, field)) continue;
    assert.ok(LEGACY_UNBOUND_NUMERIC_PARAMETERS[field], `${target}.${field}: register a working proposal control, or list it in PENDING_CONTROL_PARAMETERS with why its dial follows later`);
    seenGaps.add(field);
  }
  assert.deepEqual([...seenGaps].sort(), Object.keys(LEGACY_UNBOUND_NUMERIC_PARAMETERS).sort(), "Remove repaired or deleted legacy gaps instead of leaving stale exceptions");
});

test("non-numeric effects require a real control or an explicit tracked legacy gap", () => {
  for (const control of EFFECT_CONTROLS) {
    if (!control.agentWritable || control.kind === "number") continue;
    assert.ok(isSupportedProposalControl("props", control.prop, control.identity)
      || Object.hasOwn(STRUCTURED_EFFECT_PROPOSAL_GAPS, control.prop) || Object.hasOwn(PENDING_CONTROL_PARAMETERS, control.prop),
    `${control.prop}: add its typed proposal adapter, or list it in PENDING_CONTROL_PARAMETERS`);
  }
});

/** Every field an agent can write: proposal props/patch/create shapes and registered effects. */
function agentWritableFields() {
  const schemas = [editorAgentPropsSchema, editorAgentCreateVisualSchema, editorAgentCreateTextSchema, editorAgentCreateAudioSchema, editorAgentOperationSchema.shape.patch.unwrap()];
  return new Set([...schemas.flatMap(schema => Object.keys(schema.shape)), ...EFFECT_CONTROLS.filter(control => control.agentWritable).map(control => control.prop)]);
}

/** Whether a pending field has gained a working dial (the entry is then stale). */
function hasWorkingControl(field: string) {
  if (PROPOSAL_TUNABLE_FIELDS[field]) return true;
  const effect = EFFECT_CONTROLS.find(control => control.agentWritable && control.prop === field);
  return Boolean(effect && isSupportedProposalControl("props", field, effect.identity));
}

test("a field may ship before its dial only with a reason, and leaves the list once the dial exists", () => {
  const writable = agentWritableFields();
  for (const [field, reason] of Object.entries(PENDING_CONTROL_PARAMETERS)) {
    assert.ok(reason.trim().length >= 20, `${field}: say why its dial is not built yet`);
    assert.ok(writable.has(field), `${field}: not an agent-writable field; remove it or add the field to the proposal contract`);
    assert.ok(!hasWorkingControl(field), `${field}: its dial now exists; remove it from PENDING_CONTROL_PARAMETERS`);
    assert.ok(!Object.hasOwn(LEGACY_UNBOUND_NUMERIC_PARAMETERS, field) && !Object.hasOwn(STRUCTURAL_NUMERIC_PARAMETERS, field), `${field}: listed twice`);
  }
});

test("a field without a dial still stages and is recorded as a control gap", () => {
  // An unregistered prop name stands in for a newly admitted field whose dial is pending.
  const gaps = controlGaps([{ element_id: "00000000-0000-4000-8000-000000000001", props: { pending_probe_amount: 0.5 } }]);
  assert.deepEqual(gaps, [{ operation_index: 0, target: "props", field: "pending_probe_amount", value_kind: "number" }]);
  assert.equal(hasWorkingControl("pending_probe_amount"), false);
});

test("newly connected effect fields require selection; old proposals do not gain extra sliders", () => {
  const change = { operation_index: 0, target: "props", field: "mask_feather", after_value: 0.1 };
  assert.equal(proposalControlIsVisible(change), false);
  assert.equal(proposalControlIsVisible(change, [{ operation_index: 0, target: "props", field: "mask_feather" }]), true);
});

function assertNestedTransitionCoverage(schema: z.ZodType, prefix = "") {
  let type = schema;
  while (type instanceof z.ZodOptional || type instanceof z.ZodNullable || type instanceof z.ZodDefault) type = type.unwrap() as z.ZodType;
  if (type instanceof z.ZodObject) {
    for (const [field, child] of Object.entries(type.shape)) assertNestedTransitionCoverage(child as z.ZodType, prefix ? `${prefix}.${field}` : field);
  } else if (type instanceof z.ZodNumber) {
    assert.ok(transitionControl(prefix), `${prefix}: unregistered nested transition number`);
  } else if (type instanceof z.ZodTuple || type instanceof z.ZodArray) {
    assert.ok(Object.hasOwn(STRUCTURED_TRANSITION_PARAMETERS, prefix), `${prefix}: structured transition value needs a typed owner`);
  }
}

test("transition create, patch and nested params cannot bypass parameter coverage", () => {
  assertNestedTransitionCoverage(timelineTransitionCreateSchema);
  assertNestedTransitionCoverage(timelineTransitionPatchSchema);
  assertNestedTransitionCoverage(transitionParamsSchema, "params");
  assertNestedTransitionCoverage(editorAgentOperationSchema.shape.create_transition);
  assert.throws(() => assertNestedTransitionCoverage(z.object({params: z.object({unbound_zoom: z.number().optional()})})), /unbound_zoom/);
  assert.throws(() => assertNestedTransitionCoverage(z.object({params: z.object({nested: z.object({unbound: z.number()})})})), /nested.unbound/);
  assert.throws(() => assertNestedTransitionCoverage(z.object({params: z.object({unbound: z.array(z.number())})})), /typed owner/);
});

test("every transition number traverses selected inventory, nested override, reset and shared derivation", () => {
  const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
  const timeline = {elements: [a,b].map((id, i) => ({id, project_id:"fixture",type:"video_clip",source_url:"/synthetic.mp4",timeline_start:i*3,duration:3,trim_start:1,trim_end:1,playback_rate:1,lane_key:"visual_0",lane_index:0,props:{},removed_at:null})),transitions:[]} as unknown as TimelineFile;
  for (const control of TRANSITION_CONTROLS) {
    const params = control.field.startsWith("params.") ? {[control.field.slice(7)]:control.default} : {};
    const option = editorAgentOptionSchema.parse({id:"transition",label:"Transition",summary:"Transition",recommended:true,requested_mutations:5,review_controls:[{operation_index:0,target:"create_transition",field:control.field}],operations:[{element_id:"33333333-3333-4333-8333-333333333333",create_transition:{from_element_id:a,to_element_id:b,type:"whip",duration_seconds: control.field === "duration_seconds" ? control.default : .5, params}}]});
    const inventory = proposalControlInventory(timeline, option)[0].controls;
    const selected = inventory.find(item=>item.field===control.field)!;
    assert.equal(selected.selected,true, control.field);
    const scale = "scale" in control ? control.scale : 1;
    assert.equal(selected.display?.min,control.min * scale);
    assert.equal(selected.display?.max,control.max * scale);
    const spec = proposalTunableField("create_transition", control.field)!;
    for (const value of [control.min, control.default, control.max]) assert.ok(Math.abs(spec.fromDisplay!(spec.toDisplay!(value)) - value) < 1e-8);
    for (const value of [control.min,control.default,control.max]) {
      const tuned = applyProposalNumericOverrides(option,[{operation_index:0,target:"create_transition",field:control.field,value}]);
      const preview = deriveProposalTimeline(timeline,tuned.operations,"fixture").timeline;
      const approved = deriveProposalTimeline(timeline,tuned.operations,"fixture").timeline;
      assert.deepEqual(preview.transitions.map(({created_at, updated_at, ...value}) => value),approved.transitions.map(({created_at, updated_at, ...value}) => value));
      const transition=preview.transitions[0];
      assert.equal(control.field === "duration_seconds" ? transition.duration_seconds : transition.params?.[control.field.slice(7) as keyof typeof transition.params],value);
      assert.deepEqual(preview.elements,timeline.elements,"source windows must survive transition tuning");
    }
    assert.deepEqual(applyProposalNumericOverrides(option,[]),option);
    assert.throws(()=>applyProposalNumericOverrides(option,[{operation_index:0,target:"create_transition",field:control.field,value:control.max+1}]));
    if (control.field !== "params.smear_zoom_percent") assert.throws(()=>applyProposalNumericOverrides(option,[{operation_index:0,target:"create_transition",field:"params.smear_zoom_percent",value:0}]), /already-proposed/);
  }
});

test("smear geometry uses declared controls, has a zero-motion setting and preserves legacy defaults", () => {
  const old=resolveSmearTransitionVisualStyle(.5,"out","from-right",{});
  assert.equal(old.transform,"translate3d(-6%, 0%, 0) scale(1.175)");
  for (const phase of ["in","out"] as const) for (const p of [0,.25,.5,.75,1]) {
    const zero=resolveSmearTransitionVisualStyle(p,phase,"from-right",{smear_zoom_percent:0,smear_travel_percent:0,whip_blur_strength:0});
    assert.equal(zero.transform,"translate3d(0%, 0%, 0) scale(1)");
    assert.equal(zero.blurPx,0);
  }
  const source=fs.readFileSync("src/lib/remotion/TimelineComposition.tsx","utf8");
  assert.match(source,/resolveSmearTransitionVisualStyle\(transitionOutProgress/);
  assert.match(source,/transform: smearOut.transform/);
  assert.match(source,/transform = style.transform/);
  assert.doesNotMatch(source,/transitionOutProgress \* \.35|inverse \* \.35|const smearTravel =|const travel = sign \* inverse \* 12/);
});

test("nested transition groups preserve atomic tuning and the slider budget", () => {
  const fields = ["duration_seconds", "params.whip_blur_strength", "params.smear_zoom_percent", "params.smear_travel_percent"];
  const operations = Array.from({length:4}, (_, i) => ({element_id:`33333333-3333-4333-8333-${String(i).padStart(12,"0")}`,create_transition:{from_element_id:"11111111-1111-4111-8111-111111111111",to_element_id:"22222222-2222-4222-8222-222222222222",type:"whip",duration_seconds:.5,params:{motion:"smear",whip_blur_strength:1,smear_zoom_percent:35,smear_travel_percent:12}}}));
  const base = {id:"transition-group",label:"Transitions",summary:"Transitions",recommended:true,requested_mutations:20,operations};
  const timeline = {elements:[],transitions:[]} as unknown as TimelineFile;
  const separate = editorAgentOptionSchema.parse({...base,review_controls:operations.flatMap((_, operation_index) => fields.map(field=>({operation_index,target:"create_transition",field})))});
  assert.equal(proposalSliderCount(timeline,separate),16);
  assert.throws(()=>assertProposalControlBudget(timeline,[separate]),/maximum is 15/);
  const linked = editorAgentOptionSchema.parse({...base,review_controls:fields.map(field=>({operation_index:0,target:"create_transition",field,linked_operation_indices:[1,2,3]}))});
  assert.equal(proposalSliderCount(timeline,linked),4);
  assert.doesNotThrow(()=>assertProposalControlBudget(timeline,[linked]));
  const tuned=applyProposalNumericOverrides(linked,[{operation_index:2,target:"create_transition",field:"params.smear_zoom_percent",value:0}]);
  assert.deepEqual(tuned.operations.map(op=>op.create_transition?.params?.smear_zoom_percent),[0,0,0,0]);
  assert.deepEqual(tuned.operations.map(op=>op.create_transition?.params?.smear_travel_percent),[12,12,12,12]);
  assert.deepEqual(applyProposalNumericOverrides(linked,[]),linked);
  assert.equal(proposalSliderCount(timeline,editorAgentOptionSchema.parse(base)),0,"Historical proposals do not gain controls automatically");
  assert.throws(()=>applyProposalNumericOverrides(linked,[{operation_index:0,target:"create_transition",field:"params.unregistered",value:0}]),/already-proposed/);
  const mismatch=structuredClone(linked);
  mismatch.operations[1].create_transition!.params!.smear_zoom_percent=20;
  // A linked dial whose authored values diverge is dropped, never applied to the unmatched clips.
  const reparsed=editorAgentOptionSchema.parse(mismatch);
  assert.ok(reparsed.review_controls?.every(ref=>ref.field!=="params.smear_zoom_percent"),"Linked authored values must match");
  assert.match(reparsed.dropped_review_controls?.map(item=>item.reason).join(" ")??"",/linked values \(numbers, colours, wheels or curves\) must match/);
});


test("handwriting weight supports bounded proposal tuning and identical timeline derivation", () => {
  const id = "00000000-0000-4000-8000-000000000031";
  const timeline = { elements: [{ id, project_id: "fixture", type: "caption_text", timeline_start: 0, duration: 2, lane_key: "captions_0", lane_index: 0, props: { text: "Example", animationIn: "handwriting" }, removed_at: null }], transitions: [] } as unknown as TimelineFile;
  const option = editorAgentOptionSchema.parse({ id: "ink", label: "Ink", summary: "Ink", recommended: true, requested_mutations: 1, operations: [{ element_id: id, props: { handwritingWeight: 2 } }], review_controls: [{ operation_index: 0, target: "props", field: "handwritingWeight" }] });
  assert.ok(proposalControlInventory(timeline, option)[0].controls[0].selected);
  for (const value of [0, 2, 4]) {
    const tuned = applyProposalNumericOverrides(option, [{ operation_index: 0, target: "props", field: "handwritingWeight", value }]);
    assert.equal(deriveProposalTimeline(timeline, tuned.operations, "fixture").timeline.elements[0].props?.handwritingWeight, value);
  }
  assert.deepEqual(applyProposalNumericOverrides(option, []), option);
  assert.throws(() => applyProposalNumericOverrides(option, [{ operation_index: 0, target: "props", field: "handwritingWeight", value: 5 }]));
  assert.equal(editorAgentCreateTextSchema.shape.handwritingWeight.parse(2), 2);
});

test("every block setting is a registered dial: display metadata, bounded tuning, reset and the card's inventory", async () => {
  const { listBlockDefinitions, blockReviewChanges, compileBlock, setBlockSetting, resolveBlockSettings } = await import("./proposal-blocks");
  const { blockSettingDisplay } = await import("./proposal-block-kit");
  const media = "/api/projects/fixture/media";
  const fixtures: Record<string, Record<string, unknown>> = {
    live_hold: { source: { source_url: `${media}/sources/walk.mp4`, source_duration_seconds: 40 }, lane: { lane_key: "visual_1", lane_index: 1 }, timeline_start: 0, settle_seconds: 5, takeoff_seconds: 5.5 },
    keyframed_move: { cutout: { source_url: `${media}/cutouts/a.webm`, source_duration_seconds: 2, source_offset_seconds: 5 }, lane: { lane_key: "visual_1", lane_index: 1 }, timeline_start: 0, source_start_seconds: 5.5, subject_height: 0.5, to: { scale: 1, offset_x: 0.8, offset_y: 0 }, far_end: "end" },
    hop_sequence: { source: { source_url: `${media}/sources/walk.mp4`, source_duration_seconds: 40 }, empty_set: { source_url: `${media}/sources/walk.mp4`, source_duration_seconds: 40 },
      stops: [{ label: "A", cutout: { source_url: `${media}/cutouts/a.webm`, source_duration_seconds: 3, source_offset_seconds: 4 }, subject: { cx: 0.3, cy: 0.5, h: 0.6 }, settle_seconds: 5, takeoff_seconds: 5.5 },
        { label: "B", cutout: { source_url: `${media}/cutouts/b.webm`, source_duration_seconds: 3, source_offset_seconds: 11 }, subject: { cx: 0.7, cy: 0.5, h: 0.5 }, settle_seconds: 12, takeoff_seconds: 12.5 }],
      // With sounds and a closing exit, so the Sound volume and Leaves dials reach the card too.
      sounds: { landings: [{ source_url: "/api/sfx-catalog/media/whoosh.wav", source_duration_seconds: 0.4, peak_seconds: 0.05 }] }, closing_exit: { style: "side" } },
    flash_sequence: { source: { source_url: `${media}/sources/walk.mp4`, source_duration_seconds: 40 }, empty_set: { source_url: `${media}/sources/walk.mp4`, source_duration_seconds: 40 },
      poses: [{ label: "A", cutout: { source_url: `${media}/cutouts/a.webm`, source_duration_seconds: 0.5, source_offset_seconds: 5 }, at_seconds: 5.1 },
        { label: "B", cutout: { source_url: `${media}/cutouts/b.webm`, source_duration_seconds: 0.5, source_offset_seconds: 12 }, at_seconds: 12.1 }],
      line_end_seconds: 14, sound: { source_url: "/api/sfx-catalog/media/click.wav", source_duration_seconds: 0.18, peak_seconds: 0.075 } },
  };
  for (const definition of listBlockDefinitions()) {
    const inputs = fixtures[definition.kind];
    assert.ok(inputs, `${definition.kind} needs a contract fixture`);
    const instance = { block_id: "b", kind: definition.kind, version: definition.version, inputs, settings: {}, seed: "s", frame_rate: 30 };
    const authored = compileBlock(instance);
    for (const item of resolveBlockSettings(instance)) {
      const change = blockReviewChanges(instance, 0).find(candidate => candidate.field === item.field)!;
      assert.ok(change && change.target === "block" && change.control_tier === item.tier, `${definition.kind}.${item.field} reaches the card`);
      // Every number: a registered display, a working spec, both ends tunable, and a reset to the authored result.
      if (item.setting.kind === "number") {
        const display = blockSettingDisplay(item.setting);
        assert.ok(display.step > 0 && display.suffix, `${definition.kind}.${item.field} display`);
        assert.ok(isSupportedProposalControl("block", item.field, item.value));
        const spec = proposalTunableField("block", item.field, change.control_range, undefined, change.control_display)!;
        assert.deepEqual([spec.min, spec.max, spec.step, spec.suffix], [item.range.min, item.range.max, display.step, display.suffix]);
        for (const value of [item.range.min, item.range.max]) {
          const tuned = setBlockSetting(instance, item.field, value);
          assert.equal(resolveBlockSettings(tuned).find(candidate => candidate.field === item.field)!.value, value);
          compileBlock(tuned);
        }
        assert.throws(() => setBlockSetting(instance, item.field, item.range.max + 1), new RegExp(`\\(${item.field.replace(".", "\\.")}\\) at .* is outside`));
        assert.deepEqual(compileBlock(setBlockSetting(instance, item.field, item.value)), authored);
        continue;
      }
      assert.ok(change.control_choices && change.control_choices.length >= 2, `${definition.kind}.${item.field} offers its choices`);
      for (const choice of item.setting.choices) compileBlock(setBlockSetting(instance, item.field, choice.value));
      assert.throws(() => setBlockSetting(instance, item.field, "nonsense"), /must be one of/);
    }
  }
});
