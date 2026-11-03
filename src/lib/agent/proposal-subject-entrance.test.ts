import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileProposalSubjectEntrance} from './proposal-subject-entrance';
import {applyProposalNumericOverrides} from './proposal-overrides';
import {editorAgentOptionSchema} from './timeline-editor-agent-apply';
import {quantizeVisualFrameSpan} from '../timeline/frame-quantization';
const visual = {type:'video_clip',source_url:'/api/projects/test/media/test.webm',timeline_start:0,source_duration_seconds:8,source_start_seconds:.5,source_end_seconds:2.5,lane_key:'visual_4',lane_index:4,subject_entrance_seconds:.2,subject_flash_seconds:2/30,subject_glow_fade_seconds:2/30,subject_flash:1,subject_glow:1.8,subject_glow_radius:18,transition_keyframes:{}};
test('entrance overrides compile identically for review and approval, including zero delay',()=>{
 const option=editorAgentOptionSchema.parse({id:'entrance',label:'Entrance',summary:'Test',recommended:true,requested_mutations:Object.keys(visual).length,operations:[{element_id:'11111111-1111-4111-8111-111111111111',create_visual:visual,rationale:'Test'}]});
 const tuned=applyProposalNumericOverrides(option,[{operation_index:0,target:'create_visual',field:'subject_glow',value:.9},{operation_index:0,target:'create_visual',field:'subject_entrance_seconds',value:0},{operation_index:0,target:'create_visual',field:'subject_flash_seconds',value:.1}]);
 const keys=tuned.operations[0].create_visual!.transition_keyframes!;
 assert.deepEqual(keys.subject_flash,[{t:0,v:1,ease:'hold'},{t:.1,v:0,ease:'hold'}]);
 assert.equal(keys.subject_glow![0].v,.9);
 assert.deepEqual(compileProposalSubjectEntrance(tuned.operations[0]),tuned.operations[0]);
 assert.equal(option.operations[0].create_visual!.subject_glow,1.8);
 assert.throws(()=>compileProposalSubjectEntrance({create_visual:{...visual,subject_entrance_seconds:1.99}}),/inside the clip/);
});

test('handled pose entrances end on the same frame grid as created visuals',()=>{
 for (const [start, frames] of [[3/30,3],[6/30,4],[18/30,5],[23/30,31],[.017,4]]) {
  const sourceEnd=2+frames/30;
  const result=compileProposalSubjectEntrance({create_visual:{...visual,timeline_start:start,source_start_seconds:2,source_end_seconds:sourceEnd,subject_entrance_seconds:0,subject_flash_seconds:1/30,subject_glow_fade_seconds:2/30}});
  const duration=quantizeVisualFrameSpan(start,sourceEnd-2).duration;
  const keys=result.create_visual.transition_keyframes as Record<string,Array<{t:number}>>;
  assert.equal(keys.media_opacity.at(-1)!.t,duration);
  assert.ok(Object.values(keys).flat().every(point=>point.t<=duration));
 }
});

test('existing-clip glow amount scales the visible envelope and resets from authored keys', () => {
 const option = editorAgentOptionSchema.parse({id:'glow',label:'Glow',summary:'Glow',recommended:true,requested_mutations:2,
   operations:[{element_id:'11111111-1111-4111-8111-111111111111',props:{subject_glow:1.8,transition_keyframes:{
     subject_glow:[{t:0,v:1.8,ease:'hold'},{t:.1,v:.9,ease:'linear'},{t:.3,v:0,ease:'hold'}],
   }}}]});
 const override=(value:number)=>applyProposalNumericOverrides(option,[{operation_index:0,target:'props',field:'subject_glow',value}]);
 assert.deepEqual(override(.9).operations[0].props!.transition_keyframes!.subject_glow!.map(p=>p.v),[.9,.45,0]);
 assert.deepEqual(override(0).operations[0].props!.transition_keyframes!.subject_glow!.map(p=>p.v),[0,0,0]);
 assert.deepEqual(override(3).operations[0].props!.transition_keyframes!.subject_glow!.map(p=>p.v),[3,1.5,0]);
 assert.deepEqual(applyProposalNumericOverrides(option,[]),option);
});

test('streak blur dial changes the envelope peak without changing walking or exit times', () => {
 const option=editorAgentOptionSchema.parse({id:'blur',label:'Blur',summary:'Blur',recommended:true,requested_mutations:2,
 operations:[{element_id:'11111111-1111-4111-8111-111111111111',props:{directional_blur_x:96,transition_keyframes:{
 directional_blur_x:[{t:0,v:0,ease:'hold'},{t:2.1,v:0,ease:'linear'},{t:2.3,v:96,ease:'linear'},{t:2.5,v:0,ease:'hold'}],
 }}}]});
 for(const value of [0,48,96,200]) {
  const result=applyProposalNumericOverrides(option,[{operation_index:0,target:'props',field:'directional_blur_x',value}]);
  const points=result.operations[0].props!.transition_keyframes!.directional_blur_x!;
  assert.deepEqual(points.map(p=>p.t),[0,2.1,2.3,2.5]);
  assert.deepEqual(points.map(p=>p.v),[0,0,value,0]);
 }
 assert.deepEqual(applyProposalNumericOverrides(option,[]),option);
});


test('new still flash intensity tunes its animated peak and preserves the source-color handoff', () => {
 const option = editorAgentOptionSchema.parse({id:'still-flash',label:'Still flash',summary:'Still flash',recommended:true,requested_mutations:9,
  operations:[{element_id:'11111111-1111-4111-8111-111111111111',create_visual:{
   type:'still',source_url:'/api/projects/test/media/car.png',timeline_start:0,duration_seconds:5/30,
   lane_key:'visual_0',lane_index:0,has_alpha:true,subject_flash:1,
   transition_keyframes:{subject_flash:[{t:0,v:1,ease:'hold'},{t:2/30,v:0,ease:'hold'},{t:5/30,v:0,ease:'hold'}]},
  }}]});
 for (const value of [0,.4,1]) {
  const tuned = applyProposalNumericOverrides(option,[{operation_index:0,target:'create_visual',field:'subject_flash',value}]);
  const points = tuned.operations[0].create_visual!.transition_keyframes!.subject_flash!;
  assert.deepEqual(points.map(p=>p.v),[value,0,0]);
  assert.deepEqual(points.map(p=>p.t),[0,2/30,5/30]);
 }
 assert.deepEqual(applyProposalNumericOverrides(option,[]),option);
});
