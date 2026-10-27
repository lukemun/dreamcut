import assert from 'node:assert/strict';
import test from 'node:test';
import {compileProposalSpeedRamp} from './proposal-speed-ramp';
import {applyProposalNumericOverrides} from './proposal-overrides';
import {speedStepDuration, speedAtTimelineTime, timelineTimeToSourceTime, sourceTimeToTimelineTime} from '../timeline/speed-steps';
import type {EditorAgentOption} from './timeline-editor-agent-apply';
const operation = {element_id:'00000000-0000-4000-8000-000000000001',patch:{timeline_start:10,duration:4,trim_start:8,trim_end:44,playback_rate:1.5},props:{playback_ramp_start_rate:1.5,playback_ramp_end_rate:2.5,playback_ramp_source_duration_seconds:60}};
function media(op:ReturnType<typeof compileProposalSpeedRamp>) {
 const steps = op.props!.playback_speed_steps as {source_t:number,v:number}[];
 return {...op.patch!,props:{source_duration_seconds:60,keyframes:{playback_rate:steps.map(p=>({...p,t:p.source_t,ease:'hold'}))}}} as Parameters<typeof speedStepDuration>[0];
}
test('endpoint ramp keeps the screen clock and monotonically advances source time',()=>{
 const compiled=compileProposalSpeedRamp(operation), m=media(compiled);
 assert.equal(compiled.patch!.trim_end,44);
 assert.equal(speedStepDuration(m),4);
 assert.equal(speedAtTimelineTime(m,0),1.5);
 assert.equal(speedAtTimelineTime(m,3.99),2.5);
 let last=8;
 for(let t=0;t<=4;t+=1/30){ const source=timelineTimeToSourceTime(m,t);assert.ok(source>=last);last=source; }
 assert.equal(operation.props.playback_ramp_start_rate,1.5);
});
test('tuning either endpoint recalculates the source tail and integrated clock',()=>{
 const option:EditorAgentOption={id:'ramp',label:'Ramp',summary:'Ramp',recommended:true,requested_mutations:9,operations:[compileProposalSpeedRamp(operation)]};
 for(const [field,value] of [['playback_ramp_start_rate',.5],['playback_ramp_end_rate',4]] as const){
  const tuned=applyProposalNumericOverrides(option,[{operation_index:0,target:'props',field,value}]);
  const m=media(tuned.operations[0]);assert.equal(speedStepDuration(m),4);
  assert.ok(Math.abs(timelineTimeToSourceTime(m,4)-(60-tuned.operations[0].patch!.trim_end!))<.00001);
 }
});
test('incomplete or exhausted source clocks fail closed',()=>{
 assert.throws(()=>compileProposalSpeedRamp({...operation,patch:{duration:4}}),/complete trim tuple/);
 assert.throws(()=>compileProposalSpeedRamp({...operation,props:{...operation.props,playback_ramp_source_duration_seconds:10}}),/source handles/);
});

test('peak ramp keeps a trimmed foreground and mask source anchors synchronized when tuned',()=>{
 const common={playback_ramp_fast_rate:1.7,playback_ramp_top_rate:.45,
  playback_ramp_slow_start_source_seconds:2.45,playback_ramp_slow_end_source_seconds:3,
  playback_ramp_profile:{origin_source_seconds:0,origin_timeline_seconds:0,
   hold_end_source_seconds:3.15,recovery_end_source_seconds:3.4}};
 const mask=[{t:0,v:[0,0,0,0] as [number,number,number,number],ease:'hold' as const},
  {t:2.1,v:[0,0,0,0] as [number,number,number,number],ease:'easeOut' as const},
  {t:2.403333,v:[.304,0,.447,0] as [number,number,number,number],ease:'hold' as const},
  {t:3.4,v:[.304,0,.447,0] as [number,number,number,number],ease:'easeInOut' as const},
  {t:3.95,v:[0,0,0,0] as [number,number,number,number]}];
 for(const fast of [1.3,1.7,2.2]) {
  const background=compileProposalSpeedRamp({patch:{timeline_start:0,duration:5.16,trim_start:0,trim_end:.033333,playback_rate:1},props:{...common,playback_ramp_fast_rate:fast,playback_ramp_source_duration_seconds:5.184,playback_ramp_profile:{...common.playback_ramp_profile,mask_source_keyframes:mask}}});
  const foreground=compileProposalSpeedRamp({patch:{timeline_start:2.1,duration:1.86,trim_start:2.1,trim_end:1.233333,playback_rate:1},props:{...common,playback_ramp_fast_rate:fast,playback_ramp_source_duration_seconds:5.125}});
  const bg={...background.patch!,props:{source_duration_seconds:5.184,keyframes:{playback_rate:(background.props!.playback_speed_steps as {source_t:number;v:number}[]).map(p=>({...p,t:p.source_t}))}}};
  const fg={...foreground.patch!,props:{source_duration_seconds:5.125,keyframes:{playback_rate:(foreground.props!.playback_speed_steps as {source_t:number;v:number}[]).map(p=>({...p,t:p.source_t}))}}};
  assert.ok(Math.abs(foreground.patch!.timeline_start!-sourceTimeToTimelineTime(bg,2.1))<.0001);
  assert.ok(Math.abs(speedStepDuration(bg)-background.patch!.duration!)<.001);
  assert.ok(Math.abs(speedStepDuration(fg)-foreground.patch!.duration!)<.001);
  for(const point of mask) assert.ok(Math.abs((background.props!.mask_inset_keyframes as {t:number}[]).find(p=>p.t===0 && point.t===0 || p.t>0 && Math.abs(p.t-sourceTimeToTimelineTime(bg,point.t))<.0001)?.t! -sourceTimeToTimelineTime(bg,point.t))<.0001);
 }
});

test('peak ramp bar close stays at its clip time and duration when opening speed changes',()=>{
 const make=(fast:number)=>compileProposalSpeedRamp({patch:{timeline_start:0,duration:5.16,trim_start:0,trim_end:.033333,playback_rate:1},props:{
  playback_ramp_fast_rate:fast,playback_ramp_top_rate:.45,
  playback_ramp_slow_start_source_seconds:2.9,playback_ramp_slow_end_source_seconds:3,
  playback_ramp_bar_close_start_seconds:1.35,playback_ramp_bar_close_duration_seconds:.35,
  playback_ramp_bar_reopen_start_seconds:1.95,playback_ramp_bar_reopen_duration_seconds:.55,
  playback_ramp_source_duration_seconds:5.184,
  playback_ramp_profile:{origin_source_seconds:0,origin_timeline_seconds:0,hold_end_source_seconds:3.05,
   recovery_end_source_seconds:3.2,mask_depth:[.304,0,.447,0]},
 }});
 for(const fast of [1.7,2.09,2.4]) {
  const op=make(fast);
  const mask=op.props!.mask_inset_keyframes as {t:number;v:number[]}[];
  assert.deepEqual(mask.map(p=>p.t),[0,1.35,1.7,1.95,2.5]);
  assert.deepEqual(mask[2]!.v,[.304,0,.447,0]);
  assert.ok(op.patch!.duration!>2.5);
 }
 assert.throws(()=>compileProposalSpeedRamp({...make(2.09),props:{...make(2.09).props,playback_ramp_bar_close_duration_seconds:.7}}),/bar timing/);
});

test('proposal derivation retains native keyframes and the same approved screen duration',async()=>{
 const {deriveProposalTimeline,editorAgentOperationSchema}=await import('./timeline-editor-agent-apply');
 const base={id:operation.element_id,project_id:'fixture',type:'video_clip' as const,source_url:null,props:{source_duration_seconds:60},beat_id:null,character_id:null,timeline_start:10,duration:4,lane_key:'visual_0',lane_index:0,trim_start:8,trim_end:44,volume:0,fade_in:0,fade_out:0,playback_rate:2.5,position_locked:false,removed_at:null,removed_reason:null,created_at:'2026-09-29T00:00:00Z',updated_at:'2026-09-29T00:00:00Z'};
 const timeline={elements:[base],transitions:[]};
 for(const end of [1.5,2.5,4]){
  const op=editorAgentOperationSchema.parse(compileProposalSpeedRamp({...operation,props:{...operation.props,playback_ramp_end_rate:end}}));
  const result=deriveProposalTimeline(timeline,[op],'fixture').timeline.elements[0]!;
  assert.ok(Math.abs(speedStepDuration(result)-4)<1/30);
  assert.equal(speedAtTimelineTime(result,3.99),end);
  assert.equal(result.duration,4);
  assert.equal(result.props.playback_ramp_start_rate,undefined);
 }
 assert.equal(base.playback_rate,2.5);
});
