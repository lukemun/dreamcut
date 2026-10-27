import test from "node:test";
import assert from "node:assert/strict";
import { editorAgentOptionSchema, countOperationMutations, deriveProposalTimeline, controlGaps, withDefaultReviewControls } from "./timeline-editor-agent-apply";
import { reviewOption } from "./proposal-review";
import { applyProposalNumericOverrides } from "./proposal-overrides";
import { assertProposalControlBudget, proposalSliderCount } from "./proposal-control-budget";
import { proposalControlInventory } from "./proposal-control-inventory";
import { proposalTunableField } from "./proposal-controls";
import { proposalAdjustmentTiers } from "../../components/studio/timeline/proposal-adjustments";
import type { TimelineFile } from "../local-store/store";

const ids = [1,2,3].map(i => `00000000-0000-4000-8000-${String(i).padStart(12,"0")}`);
const timeline: TimelineFile = {elements: ids.slice(0,2).map((id,i) => ({id, project_id:"fixture", type:"still", source_url:"/api/projects/fixture/media/synthetic.png", lane_key:"visual_0", lane_index:0, timeline_start:i*2, duration:2, trim_start:0, trim_end:null, playback_rate:1, props:{}, removed_at:null})) as TimelineFile["elements"], transitions:[]};
function option(operations: unknown[], extra = {}) {
  return editorAgentOptionSchema.parse({id:"tune", label:"Tune", summary:"Tune", recommended:true, operations, requested_mutations:countOperationMutations(operations as never), ...extra});
}
const transition = {element_id:ids[2],create_transition:{from_element_id:ids[0],to_element_id:ids[1],type:"whip",duration_seconds:.5,params:{motion:"smear"}}};

test("priority selection partitions the complete inventory; advanced geometry tunes without a replacement", () => {
  const draft = option([{element_id:ids[0],props:{media_scale:1,media_offset_x:0,media_offset_y:0,subject_flash:0}}], {review_controls:[{operation_index:0,target:"props",field:"subject_flash"}]});
  const review = reviewOption(timeline,draft);
  const tiers = proposalAdjustmentTiers(review);
  assert.deepEqual(tiers.main.map(item=>item.change.field),["subject_flash"]);
  assert.deepEqual(tiers.advanced.map(item=>item.change.field),["media_scale","media_offset_x","media_offset_y"]);
  const tuned = applyProposalNumericOverrides(draft,[{operation_index:0,target:"props",field:"media_scale",value:1.5}]);
  assert.equal(deriveProposalTimeline(timeline,tuned.operations,"fixture").timeline.elements[0].props.media_scale,1.5);
  assert.deepEqual(applyProposalNumericOverrides(draft,[]),draft);
  assert.deepEqual(timeline.elements[0].props,{});
});

test("implicit smear dials use renderer defaults, tune identically and reset without authoring defaults", () => {
  const draft=option([transition], {review_controls:[{operation_index:0,target:"create_transition",field:"duration_seconds"}]});
  const review=reviewOption(timeline,draft);
  assert.equal(review.rows[0].changes.some(change=>change.field==="params.smear_zoom_percent"),false,"defaults are not factual proposed mutations");
  const tiers=proposalAdjustmentTiers(review);
  assert.equal(tiers.main.length,1);
  const zoom=tiers.advanced.find(item=>item.change.field==="params.smear_zoom_percent")!;
  assert.equal(zoom.change.after_value,35);
  const controls=proposalControlInventory(timeline,draft)[0].controls;
  assert.equal(controls.find(c=>c.field===zoom.change.field)?.configured,false);
  const tuned=applyProposalNumericOverrides(draft,[{operation_index:0,target:"create_transition",field:zoom.change.field,value:0}]);
  const preview=deriveProposalTimeline(timeline,tuned.operations,"fixture").timeline;
  const approval=deriveProposalTimeline(timeline,tuned.operations,"fixture").timeline;
  assert.equal(preview.transitions[0].params?.smear_zoom_percent,0);
  assert.deepEqual(preview.elements,timeline.elements);
  assert.deepEqual(preview.transitions.map(({created_at,updated_at,...v})=>v),approval.transitions.map(({created_at,updated_at,...v})=>v));
  assert.deepEqual(applyProposalNumericOverrides(draft,[]),draft);
  assert.equal(draft.operations[0].create_transition?.params?.smear_zoom_percent,undefined);
  for(const field of ["params.page_curl","params.unregistered","params.__proto__.polluted"])
    assert.throws(()=>applyProposalNumericOverrides(draft,[{operation_index:0,target:"create_transition",field,value:0}]));
});

test("transition defaults are applicable and audio fade follows the authored duration and delay", () => {
  const fade=option([{...transition,create_transition:{...transition.create_transition,type:"fade",params:{audio_fade_start_progress:.2}}}]);
  const fields=reviewOption(timeline,fade).adjustment_rows[0].changes;
  assert.equal(fields.find(c=>c.field==="params.audio_fade_duration_seconds")?.after_value,.4);
  assert.equal(fields.some(c=>c.field.includes("smear") || c.field.includes("curl") || c.field.includes("whip_blur")),false);
  const curl=option([{...transition,create_transition:{...transition.create_transition,type:"page_turn",params:{}}}]);
  assert.equal(reviewOption(timeline,curl).adjustment_rows[0].changes.find(c=>c.field==="params.page_curl")?.after_value,.55);
  const selectedDefault=option([transition], {review_controls:[{operation_index:0,target:"create_transition",field:"params.smear_zoom_percent"}]});
  assert.equal(proposalAdjustmentTiers(reviewOption(timeline,selectedDefault)).main[0].change.after_value,35);
});

test("all secondary dials remain reachable above 15 while the first-class limit and linked dependencies remain enforced", () => {
  const operations=Array.from({length:20},(_,i)=>({element_id:`10000000-0000-4000-8000-${String(i).padStart(12,"0")}`,props:{subject_glow:1,subject_glow_radius:10}}));
  const plan=[{operation_index:0,target:"props",field:"subject_glow",linked_operation_indices:Array.from({length:19},(_,i)=>i+1)}];
  const draft=option(operations,{review_controls:plan});
  const tiers=proposalAdjustmentTiers(reviewOption(timeline,draft));
  assert.equal(tiers.main.length,1);
  assert.equal(tiers.advanced.length,20,"linked child strength is not exposed as a duplicate dial");
  assert.equal(proposalSliderCount(timeline,draft),1);
  assert.doesNotThrow(()=>assertProposalControlBudget(timeline,[draft]));
  const manyMain=option(operations,{review_controls:operations.slice(0,16).map((_,operation_index)=>({operation_index,target:"props",field:"subject_glow_radius"}))});
  assert.throws(()=>assertProposalControlBudget(timeline,[manyMain]),/maximum is 15/);
  const tuned=applyProposalNumericOverrides(draft,[{operation_index:0,target:"props",field:"subject_glow",value:2},{operation_index:7,target:"props",field:"subject_glow_radius",value:20}]);
  assert.ok(tuned.operations.every(op=>op.props?.subject_glow===2));
  assert.equal(tuned.operations[7].props?.subject_glow_radius,20);
});

test("locked values and bound timing children do not leak into either tier", () => {
  const locked=option([{element_id:ids[0],props:{media_scale:1,subject_glow:1}}],{preserve_fields:[{element_id:ids[0],fields:["props.media_scale"]}],review_controls:[]});
  assert.deepEqual(proposalAdjustmentTiers(reviewOption(timeline,locked)).advanced.map(item=>item.change.field),["subject_glow"]);
  const bound=option([{element_id:ids[0],patch:{duration:1}}],{timing_controls:[{id:"hold",kind:"hold",label:"Time on screen",reference_seconds:1,spacing_seconds:1,min_spacing_seconds:.5,max_spacing_seconds:2,bindings:[{operation_index:0,target:"patch",field:"duration",offset_seconds:1,spacing_multiplier:1}]}],review_controls:[{operation_index:0,target:"timing_control",field:"spacing_seconds"}]});
  const tiers=proposalAdjustmentTiers(reviewOption(timeline,bound));
  assert.equal(tiers.advanced.length,0);
  assert.equal(tiers.main[0].change.field,"spacing_seconds");
  assert.throws(()=>applyProposalNumericOverrides(bound,[{operation_index:0,target:"patch",field:"duration",value:1.5}]),/owning timing control/);
});

test("transition duration dials reflect the actual short-shot overlap limit", () => {
  const short = structuredClone(timeline);
  short.elements[0].duration = .2;
  short.elements[1].timeline_start = .2;
  short.elements[1].duration = .2;
  const draft = option([transition]);
  const duration = reviewOption(short, draft).adjustment_rows[0].changes.find(change => change.field === "duration_seconds")!;
  assert.equal(duration.control_range?.max, 5 / 30);
  const control = proposalControlInventory(short, draft)[0].controls.find(control => control.field === "duration_seconds")!;
  assert.deepEqual(control.display, {min: 2, max: 5, step: 1, suffix: "frames"});
  assert.equal(control.label, "Blend duration");
  const spec = proposalTunableField("create_transition", "duration_seconds", duration.control_range)!;
  assert.equal(spec.toDisplay!(4 / 30), 4);
  assert.equal(spec.fromDisplay!(4), 4 / 30);
  assert.equal(spec.fromDisplay!(4.2), 4 / 30, "exact entry cannot create fractional frame choices");
});

test("linked blend frame choices preserve native seconds, source timing and reset", () => {
  const third = {...timeline.elements[1], id: ids[2], timeline_start: 4};
  const linkedTimeline = {...timeline, elements: [...timeline.elements, third]};
  const operations = [0,1].map(i => ({element_id: `20000000-0000-4000-8000-${String(i).padStart(12,"0")}`, create_transition: {from_element_id: ids[i], to_element_id: ids[i+1], type: "fade", duration_seconds: 5 / 30}}));
  const draft = option(operations, {review_controls: [{operation_index: 0, target: "create_transition", field: "duration_seconds", linked_operation_indices: [1]}]});
  const spec = proposalTunableField("create_transition", "duration_seconds")!;
  const tuned = applyProposalNumericOverrides(draft, [{operation_index: 0, target: "create_transition", field: "duration_seconds", value: spec.fromDisplay!(4)}]);
  const result = deriveProposalTimeline(linkedTimeline, tuned.operations, "fixture").timeline;
  assert.deepEqual(result.transitions.map(t => t.duration_seconds), [4 / 30, 4 / 30]);
  assert.deepEqual(result.elements, linkedTimeline.elements);
  assert.deepEqual(applyProposalNumericOverrides(draft, []), draft);
  assert.deepEqual(proposalAdjustmentTiers(reviewOption(linkedTimeline, draft)).main.map(item=>item.change.field), ["duration_seconds"]);
});

test("a crop gets one dial per edge, and tuning an edge rewrites only that inset", () => {
  const draft = option([{element_id:ids[0],props:{mask_inset:[0,.1,0,.1]}}], {review_controls:[{operation_index:0,target:"props",field:"mask_inset_left"}]});
  const tiers = proposalAdjustmentTiers(reviewOption(timeline,draft));
  assert.deepEqual(tiers.main.map(item=>item.change.field),["mask_inset_left"]);
  assert.deepEqual(tiers.advanced.map(item=>item.change.field),["mask_inset_top","mask_inset_right","mask_inset_bottom"]);
  assert.equal(proposalTunableField("props","mask_inset_left")?.toDisplay?.(.1),10);
  const inventory = proposalControlInventory(timeline,draft)[0].controls.find(control=>control.field==="mask_inset_left")!;
  assert.deepEqual([inventory.before_value, inventory.after_value, inventory.changed], [0, .1, true]);
  const tuned = applyProposalNumericOverrides(draft,[{operation_index:0,target:"props",field:"mask_inset_left",value:.2}]);
  assert.deepEqual(tuned.operations[0].props?.mask_inset,[0,.1,0,.2]);
  assert.equal("mask_inset_left" in (tuned.operations[0].props ?? {}), false, "approval writes the stored value, never the dial name");
});

test("a keyframed punch-in gets a zoom amount dial that keeps its timing and easing", () => {
  const track = [{t:0,v:1,ease:"easeOut"},{t:.35,v:1.1,ease:"hold"},{t:1.5,v:1.1,ease:"hold"}];
  const draft = option([{element_id:ids[0],props:{transition_keyframes:{media_scale:track}}}], {review_controls:[{operation_index:0,target:"props",field:"media_scale_peak"}]});
  const change = proposalAdjustmentTiers(reviewOption(timeline,draft)).main[0].change;
  assert.deepEqual([change.field, change.after_value, change.control_range], ["media_scale_peak", 1.1, {min:1.01, max:3}]);
  const tuned = applyProposalNumericOverrides(draft,[{operation_index:0,target:"props",field:"media_scale_peak",value:1.2}]);
  assert.deepEqual((tuned.operations[0].props?.transition_keyframes as Record<string, unknown>).media_scale, [{t:0,v:1,ease:"easeOut"},{t:.35,v:1.2,ease:"hold"},{t:1.5,v:1.2,ease:"hold"}]);
});

test("a punch-in's timing dials move its ramps and hold while the peak stays on its anchor", () => {
  // Level until 0.6s, ramp to 1.25x at 0.8s, hold to 1.3s, back by 1.6s, end anchor at the clip's 2s.
  const track = [{t:0,v:1},{t:.6,v:1,ease:"easeOut"},{t:.8,v:1.25},{t:1.3,v:1.25,ease:"easeInOut"},{t:1.6,v:1},{t:2,v:1}];
  const draft = option([{element_id:ids[0],props:{media_scale_keyframes:track}}], {review_controls:[{operation_index:0,target:"props",field:"media_scale_peak"}]});
  const tiers = proposalAdjustmentTiers(reviewOption(timeline,draft));
  assert.deepEqual(tiers.main.map(item=>item.change.field),["media_scale_peak"]);
  const frame = 1/30, ms = (n: number) => Math.round(n*1000)/1000;
  assert.deepEqual(tiers.advanced.map(item=>[item.change.field, item.change.after_value, item.change.control_range]), [
    ["media_scale_ramp_in_seconds", .2, {min:ms(frame), max:ms(.8-frame)}],
    ["media_scale_hold_seconds", .5, {min:0, max:ms(.5+.4-frame)}],
    ["media_scale_ramp_out_seconds", .3, {min:ms(frame), max:ms(.3+.4-frame)}],
  ]);
  const tune = (field: string, value: number) => applyProposalNumericOverrides(draft,[{operation_index:0,target:"props",field,value}]).operations[0].props?.media_scale_keyframes;
  assert.deepEqual(tune("media_scale_ramp_in_seconds",.4), [{t:0,v:1},{t:.4,v:1,ease:"easeOut"},{t:.8,v:1.25},{t:1.3,v:1.25,ease:"easeInOut"},{t:1.6,v:1},{t:2,v:1}]);
  assert.deepEqual(tune("media_scale_hold_seconds",.7), [{t:0,v:1},{t:.6,v:1,ease:"easeOut"},{t:.8,v:1.25},{t:1.5,v:1.25,ease:"easeInOut"},{t:1.8,v:1},{t:2,v:1}]);
  assert.deepEqual(tune("media_scale_ramp_out_seconds",.1), [{t:0,v:1},{t:.6,v:1,ease:"easeOut"},{t:.8,v:1.25},{t:1.3,v:1.25,ease:"easeInOut"},{t:1.4,v:1},{t:2,v:1}]);
  // No hold: the peak point starts the return with the return's easing; a hold comes back from it.
  const noHold = tune("media_scale_hold_seconds",0);
  assert.deepEqual(noHold, [{t:0,v:1},{t:.6,v:1,ease:"easeOut"},{t:.8,v:1.25,ease:"easeInOut"},{t:1.1,v:1},{t:2,v:1}]);
  const rehold = option([{element_id:ids[0],props:{media_scale_keyframes:noHold}}]);
  assert.deepEqual(applyProposalNumericOverrides(rehold,[{operation_index:0,target:"props",field:"media_scale_hold_seconds",value:.2}]).operations[0].props?.media_scale_keyframes,
    [{t:0,v:1},{t:.6,v:1,ease:"easeOut"},{t:.8,v:1.25,ease:"easeInOut"},{t:1,v:1.25,ease:"easeInOut"},{t:1.3,v:1},{t:2,v:1}]);
  // Approval writes the stored track, never the dial names; the peak still lands at 0.8s.
  const tuned = applyProposalNumericOverrides(draft,[{operation_index:0,target:"props",field:"media_scale_ramp_in_seconds",value:.3},{operation_index:0,target:"props",field:"media_scale_hold_seconds",value:.6}]);
  assert.equal(Object.keys(tuned.operations[0].props ?? {}).some(key=>key.endsWith("_seconds")), false);
  const media = (deriveProposalTimeline(timeline,tuned.operations,"fixture").timeline.elements[0].props.keyframes as Record<string, unknown>).media_scale;
  assert.deepEqual(media, [{t:0,v:1},{t:.5,v:1,ease:"easeOut"},{t:.8,v:1.25},{t:1.4,v:1.25,ease:"easeInOut"},{t:1.7,v:1},{t:2,v:1}]);
  assert.deepEqual(applyProposalNumericOverrides(draft,[]),draft);
  assert.throws(()=>tune("media_scale_ramp_out_seconds",.8), /past its neighbour/);
  // A draft that names no dials gets the zoom and all three timing dials.
  const annotated = withDefaultReviewControls({options:[{id:"a",operations:[{element_id:ids[0],props:{media_scale_keyframes:track}}],control_gaps:[]}]});
  assert.deepEqual(annotated.options[0].review_controls?.map(ref=>ref.field),["media_scale_peak","media_scale_ramp_in_seconds","media_scale_hold_seconds","media_scale_ramp_out_seconds"]);
});

test("a zoom that leaves from the first frame gains a level lead-in when its ramp shortens", () => {
  const draft = option([{element_id:ids[0],props:{media_scale_keyframes:[{t:0,v:1,ease:"easeOut"},{t:.3,v:1.2},{t:1,v:1.2,ease:"easeIn"},{t:1.4,v:1}]}}]);
  const ramp = reviewOption(timeline,draft).adjustment_rows[0].changes.find(change=>change.field==="media_scale_ramp_in_seconds")!;
  assert.deepEqual([ramp.after_value, ramp.control_range], [.3, {min:.033, max:.3}]);
  assert.deepEqual(applyProposalNumericOverrides(draft,[{operation_index:0,target:"props",field:"media_scale_ramp_in_seconds",value:.1}]).operations[0].props?.media_scale_keyframes,
    [{t:0,v:1,ease:"easeOut"},{t:.2,v:1,ease:"easeOut"},{t:.3,v:1.2},{t:1,v:1.2,ease:"easeIn"},{t:1.4,v:1}]);
});

test("changed fields without a dial are recorded as gaps; derived dials and identities are not", () => {
  assert.deepEqual(controlGaps([
    {element_id:ids[0],props:{mask_inset:[0,.1,0,.1],playback_reverse:true,transition_keyframes:{media_opacity:[{t:0,v:0},{t:1,v:1}]},chroma_key_model:"x"}},
    {element_id:ids[1],props:{transition_keyframes:{media_scale:[{t:0,v:1},{t:1,v:1.2}]}},patch:{volume:.5}},
  ]), [
    {operation_index:0,target:"props",field:"playback_reverse",value_kind:"boolean"},
    {operation_index:0,target:"props",field:"transition_keyframes.media_opacity",value_kind:"keyframes"},
  ]);
  const annotated = withDefaultReviewControls({options:[{id:"a",operations:[{element_id:ids[0],props:{playback_reverse:true,mask_inset:[0,.1,0,.1]}}],control_gaps:[]}]});
  const parsed = editorAgentOptionSchema.parse({...annotated.options[0], label:"Crop", summary:"Crop", recommended:true});
  assert.deepEqual(parsed.control_gaps,[{operation_index:0,target:"props",field:"playback_reverse",value_kind:"boolean"}]);
  assert.deepEqual(parsed.review_controls?.map(ref=>ref.field),["mask_inset_top","mask_inset_right","mask_inset_bottom","mask_inset_left"]);
});

test("the zoom amount dial also tunes the dedicated zoom keyframes", () => {
  const draft = option([{element_id:ids[0],props:{media_scale_keyframes:[{t:0,v:1},{t:1,v:1.15,ease:"easeOut"}]}}]);
  const tuned = applyProposalNumericOverrides(draft,[{operation_index:0,target:"props",field:"media_scale_peak",value:1.3}]);
  assert.deepEqual(tuned.operations[0].props?.media_scale_keyframes,[{t:0,v:1},{t:1,v:1.3,ease:"easeOut"}]);
  assert.deepEqual(controlGaps(draft.operations as never),[]);
});

// Two clips on one lane: [0,2) and [2,4); a source-backed video sits alone on another lane.
const video = {id:"00000000-0000-4000-8000-000000000009", project_id:"fixture", type:"video_clip", source_url:"/api/projects/fixture/media/clip.mp4", lane_key:"visual_1", lane_index:1, timeline_start:10, duration:4, trim_start:2, trim_end:4, playback_rate:2, props:{source_duration_seconds:14}, removed_at:null};
const timed: TimelineFile = {...timeline, elements:[...timeline.elements, video] as TimelineFile["elements"]};

test("a head trim keeps its out point; Trim end changes the length; the trim owns start and length", () => {
  // Agent trimmed 1s of source off the head: start moves 0.5s at 2x, length shrinks 0.5s.
  const draft = option([{element_id:video.id,patch:{trim_start:3,timeline_start:10.5,duration:3.5}}]);
  const rows = reviewOption(timed,draft).adjustment_rows.flatMap(row=>row.changes);
  assert.deepEqual(rows.map(change=>change.field),["trim_start"], "start and length follow the trim, so they are not separate dials");
  const tuned = applyProposalNumericOverrides(draft,[{operation_index:0,target:"patch",field:"trim_start",value:4}],timed);
  assert.deepEqual(tuned.operations[0].patch,{trim_start:4,timeline_start:11,duration:3}, "out point stays at 14s");
  assert.throws(()=>applyProposalNumericOverrides(draft,[{operation_index:0,target:"patch",field:"timeline_start",value:12}],timed),/follows the trim/);
  // The models' usual head trim keeps the start: the length absorbs the trim, the source out point stays.
  const kept = option([{element_id:video.id,patch:{trim_start:3,duration:3.5}}]);
  assert.deepEqual(applyProposalNumericOverrides(kept,[{operation_index:0,target:"patch",field:"trim_start",value:4}],timed).operations[0].patch,{trim_start:4,duration:3});
  const tail = option([{element_id:video.id,patch:{trim_end:5,duration:3.5}}]);
  assert.deepEqual(applyProposalNumericOverrides(tail,[{operation_index:0,target:"patch",field:"trim_end",value:6}],timed).operations[0].patch,{trim_end:6,duration:3});
});

test("timing ranges stop at neighbours, the source and one frame", () => {
  const moved = option([{element_id:ids[1],patch:{timeline_start:2.5}}]);
  const start = reviewOption(timed,moved).adjustment_rows.flatMap(row=>row.changes).find(change=>change.field==="timeline_start")!;
  assert.deepEqual(start.control_range,{min:2,max:62}, "never back into the clip ending at 2s; a free lane ahead stops at the editor's 60s cap from the original start");
  const head = option([{element_id:video.id,patch:{trim_start:3,timeline_start:10.5,duration:3.5}}]);
  const trim = reviewOption(timed,head).adjustment_rows.flatMap(row=>row.changes).find(change=>change.field==="trim_start")!;
  assert.equal(trim.control_range!.min, 0, "the free lane lets the head extend back to the source start");
  assert.ok(Math.abs(trim.control_range!.max - (3 + (3.5 - 1/30) * 2)) < 1e-3, "at most all but one frame of the clip");
});

test("speech-bound clips get no timing dials", () => {
  const bound = {...video, id:"00000000-0000-4000-8000-000000000010", lane_key:"visual_2", props:{...video.props, speech_sync_binding:{source_element_id:"speech"}}};
  const withBound: TimelineFile = {...timed, elements:[...timed.elements, bound] as TimelineFile["elements"]};
  const draft = option([{element_id:bound.id,patch:{timeline_start:11}}]);
  assert.deepEqual(reviewOption(withBound,draft).adjustment_rows.flatMap(row=>row.changes).map(change=>change.field),[]);
});

test("an equal wheel and curve on several clips link into one dial that tunes them all", () => {
  const grade = {grade_wheel_gain:[0.015,0.005,-0.02,0], grade_curve_y:[0,0.04,1,1]};
  const draft = option(ids.slice(0,2).map(id => ({element_id:id, props:{...grade}})), {review_controls:[
    {operation_index:0,target:"props",field:"grade_wheel_gain",linked_operation_indices:[1]},
    {operation_index:0,target:"props",field:"grade_curve_y",linked_operation_indices:[1]},
  ]});
  assert.equal(draft.dropped_review_controls, undefined);
  const tiers = proposalAdjustmentTiers(reviewOption(timeline,draft));
  assert.deepEqual(tiers.main.map(item=>item.change.field).sort(),["grade_curve_y","grade_wheel_gain"]);
  assert.equal(tiers.advanced.length,0);
  const tuned = applyProposalNumericOverrides(draft,[{operation_index:0,target:"props",field:"grade_wheel_gain",value:[0.03,0,-0.03,0]}]);
  const elements = deriveProposalTimeline(timeline,tuned.operations,"fixture").timeline.elements;
  assert.deepEqual(elements.map(element=>element.props.grade_wheel_gain),[[0.03,0,-0.03,0],[0.03,0,-0.03,0]]);
  const unequal = option([{element_id:ids[0],props:{...grade}},{element_id:ids[1],props:{...grade,grade_curve_y:[0,0.1,1,1]}}], {review_controls:[
    {operation_index:0,target:"props",field:"grade_curve_y",linked_operation_indices:[1]},
  ]});
  assert.equal(unequal.dropped_review_controls?.length,1);
});

test("a sound's volume is always a main dial, shown first, even when the draft names none", () => {
  const sound = {element_id:ids[2],create_audio:{type:"sound_effect",title:"Pencil",source_url:"/api/sfx-catalog/media/licensed/pencil.wav",timeline_start:0,source_duration_seconds:3,source_start_seconds:0,source_end_seconds:3,lane_key:"sound_effect_0",lane_index:0,volume:0.5,fade_out:0.3}};
  const [chosen, empty, named, linked] = withDefaultReviewControls({options:[
    {id:"default",operations:[sound]},
    {id:"empty",operations:[sound],review_controls:[]},
    {id:"named",operations:[sound],review_controls:[{operation_index:0,target:"create_audio",field:"fade_out"}]},
    {id:"linked",operations:[sound,sound],review_controls:[{operation_index:0,target:"create_audio",field:"volume",linked_operation_indices:[1]}]},
  ]}).options as {review_controls:{operation_index:number;field:string}[]}[];
  assert.equal(chosen.review_controls[0].field,"volume");
  assert.deepEqual(empty.review_controls,[{operation_index:0,target:"create_audio",field:"volume"}]);
  assert.deepEqual(named.review_controls.map(ref=>ref.field),["volume","fade_out"]);
  assert.equal(linked.review_controls.length,1,"a linked volume dial already covers the second sound");
  const patched = withDefaultReviewControls({options:[{id:"quieter",operations:[{element_id:ids[0],patch:{volume:0.4}}],review_controls:[]}]}).options[0] as {review_controls:unknown[]};
  assert.deepEqual(patched.review_controls,[{operation_index:0,target:"patch",field:"volume"}]);
});
