import assert from "node:assert/strict";
import test from "node:test";
import type { TimelineFile } from "../local-store/store";
import { editorAgentOptionSchema, deriveProposalTimeline, countOperationMutations } from "./timeline-editor-agent-apply";
import { applyProposalNumericOverrides } from "./proposal-overrides";
import { proposalControlInventory } from "./proposal-control-inventory";
import { reviewOption } from "./proposal-review";
import { maskWindowPoints } from "./proposal-mask-window";

const clipId = "11111111-1111-4111-8111-111111111111";
const foregroundId = "22222222-2222-4222-8222-222222222222";
const props = {
  mask_window_close_start_seconds: 2.45,
  mask_window_close_duration_seconds: .3,
  mask_window_reopen_start_seconds: 3.4,
  mask_window_reopen_duration_seconds: .3,
  mask_window_top_percent: .34,
  mask_window_bottom_percent: .5,
  mask_window_foreground_id: foregroundId,
};
const timeline = {elements: [{id:clipId,project_id:"fixture",type:"video_clip",source_url:"/api/projects/fixture/media/main.mp4",timeline_start:0,duration:5.1666666667,trim_start:0,trim_end:0,playback_rate:1,volume:1,lane_key:"visual_1",lane_index:1,props:{},removed_at:null}],transitions:[]} as unknown as TimelineFile;
const operations = [
    {element_id:clipId,props},
    {element_id:foregroundId,create_visual:{type:"video_clip",source_url:"/api/projects/fixture/media/ball.webm",title:"Ball",timeline_start:2.45,source_duration_seconds:5.1666666667,source_start_seconds:2.45,source_end_seconds:3.7,playback_rate:1,lane_key:"visual_2",lane_index:2,has_alpha:true,volume:0}},
] as const;
const option = editorAgentOptionSchema.parse({
  id:"window",label:"Black bar window",summary:"Close and reopen",recommended:true,requested_mutations:countOperationMutations(operations),
  operations,
  review_controls:Object.keys(props).filter(field=>field!=="mask_window_foreground_id").map(field=>({operation_index:0,target:"props",field})),
});

test("window dials retain the existing appearance and hide source synchronization", () => {
  assert.deepEqual(maskWindowPoints(props, timeline.elements[0]!.duration).map(p=>[p.t,p.v]), [
    [0,[0,0,0,0]],[2.45,[0,0,0,0]],[2.75,[.34,0,.5,0]],[3.4,[.34,0,.5,0]],[3.6999999999999997,[0,0,0,0]],
  ]);
  const inventory=proposalControlInventory(timeline,option).flatMap(row=>row.controls);
  assert.equal(inventory.filter(control=>control.selected).length,6);
  const fields=reviewOption(timeline,option).adjustment_rows.flatMap(row=>row.changes.map(change=>change.field));
  for(const field of ["source_start_seconds","source_end_seconds","playback_rate","volume"]) assert.ok(!fields.includes(field),field);
  const derived=deriveProposalTimeline(timeline,[option.operations[0]!],"fixture").timeline;
  assert.deepEqual((derived.elements.find(element=>element.id===clipId)!.props!.keyframes as Record<string,unknown>).mask_inset,maskWindowPoints(props,timeline.elements[0]!.duration));
});

test("changing window timing moves the foreground source with the same clock", () => {
  const tuned=applyProposalNumericOverrides(option,[
    {operation_index:0,target:"props",field:"mask_window_close_start_seconds",value:2.3},
    {operation_index:0,target:"props",field:"mask_window_reopen_duration_seconds",value:.4},
    {operation_index:0,target:"props",field:"mask_window_top_percent",value:.4},
  ]);
  const foreground=tuned.operations[1]!.create_visual!;
  assert.equal(foreground.timeline_start,2.3);
  assert.equal(foreground.source_start_seconds,2.3);
  assert.equal(foreground.source_end_seconds,3.8);
  const derived=deriveProposalTimeline(timeline,[tuned.operations[0]!],"fixture").timeline;
  const points=(derived.elements.find(element=>element.id===clipId)!.props!.keyframes as {mask_inset:Array<{t:number;v:number[]}>}).mask_inset;
  assert.equal(points[1]!.t,2.3);
  assert.equal(points[2]!.v[0],.4);
  assert.ok(Math.abs(points[4]!.t-3.8)<1e-6);
  assert.throws(()=>applyProposalNumericOverrides(option,[{operation_index:1,target:"create_visual",field:"source_start_seconds",value:1}]),/picture-window timing/i);
});

test("wider timing choices remain source-bound and reject overlapping phases", () => {
  const tuned=applyProposalNumericOverrides(option,[
    {operation_index:0,target:"props",field:"mask_window_close_start_seconds",value:.5},
    {operation_index:0,target:"props",field:"mask_window_close_duration_seconds",value:1.6},
    {operation_index:0,target:"props",field:"mask_window_reopen_start_seconds",value:4.3},
    {operation_index:0,target:"props",field:"mask_window_reopen_duration_seconds",value:.5},
  ]);
  assert.deepEqual(maskWindowPoints(tuned.operations[0]!.props as typeof props, timeline.elements[0]!.duration).map(point=>point.t),[0,.5,2.1,4.3,4.8]);
  assert.equal(tuned.operations[1]!.create_visual!.source_start_seconds,.5);
  assert.equal(tuned.operations[1]!.create_visual!.source_end_seconds,4.8);
  assert.throws(()=>applyProposalNumericOverrides(option,[
    {operation_index:0,target:"props",field:"mask_window_close_duration_seconds",value:1},
  ]),/Picture window timing/i);
});
