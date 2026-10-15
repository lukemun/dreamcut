import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCompositionElements,type CompositionElement} from '../render/composition-adapters';
import type {TimelineElement} from '@/components/studio/timeline/types';
import {admitGpuScene,evaluateGpuScene,gpuSceneCapabilityIssues} from '../gpu-preview/scene';
import {gpuSceneDraws} from '../gpu-preview/scene-draws';
import {subjectWindowAlpha} from '../timeline/subject-window';

const mask={source_url:'/api/projects/test/media/grid-mattes/cut',source_start_seconds:0,fps:10,frame_count:80,width:100,height:100,source_sha256:'0'.repeat(64)};
const proxy=(url:string)=>({source_duration_seconds:8,preview_source_url:url,preview_proxy_validation:{contract:'preview-proxy-v1',url,ok:true,width:100,height:100}});
const base={project_id:'test',beat_id:null,character_id:null,trim_end:null,volume:0,fade_in:0,fade_out:0,position_locked:false,removed_at:null,removed_reason:null,created_at:'',updated_at:''};
const subject={...base,id:'subject',type:'video_clip',source_url:'/subject.mp4',timeline_start:1,duration:4,lane_key:'visual_0',lane_index:0,trim_start:2,playback_rate:1,props:proxy('/subject-preview.mp4')} as TimelineElement;
const fill=(id:string,start:number,props:Record<string,unknown>={})=>({...base,id,type:'video_clip',source_url:'/fill.mp4',timeline_start:start,duration:.6,lane_key:'visual_1',lane_index:1,trim_start:0,playback_rate:1,
 props:{...proxy('/fill-preview.mp4'),subject_window_parent_id:'subject',subject_window_mask:mask,subject_window_feather:20,...props}}) as TimelineElement;

function composed(elements:TimelineElement[]):CompositionElement[]{return buildCompositionElements(elements,new Set());}

test('CanvasKit admits a subject window and each fill in a sequence reads the subject clock',()=>{
 const elements=composed([subject,fill('a',1),fill('b',1.6),fill('c',2.2)]);
 const admission=admitGpuScene(elements,'scope','canvaskit');assert.equal(admission.supported,true,admission.supported?'':admission.reason);
 if(!admission.supported)return;
 const urls=[1.2,1.8,2.4].map(seconds=>{
  const scene=evaluateGpuScene(admission.elements,['visual_0','visual_1'],Math.round(seconds*30),320,180,'scope');
  const layer=scene.layers.find(l=>l.kind==='video'&&l.element.lane_key==='visual_1');
  assert.ok(layer&&layer.kind==='video');
  return layer.subjectWindow!.url;
 });
 // Subject local time + trim 2 s → mask frames 22, 28, 34 at 10 fps, regardless of which fill shows.
 assert.deepEqual(urls,[22,28,34].map(frame=>`${mask.source_url}/000${frame}.png`));
 // WebGPU has no subject window implementation and must refuse rather than draw unmasked.
 assert.ok(gpuSceneCapabilityIssues(elements,'scope','webgpu').some(issue=>issue.capability.startsWith('property:subject_window')));
});

test('GPU draws refuse a missing or stale window resource and carry the empty window without one',()=>{
 const admission=admitGpuScene(composed([subject,fill('a',1)]),'scope','canvaskit');assert.ok(admission.supported);if(!admission.supported)return;
 const scene=evaluateGpuScene(admission.elements,['visual_0','visual_1'],36,320,180,'scope');
 const layer=scene.layers.find(l=>l.kind==='video'&&l.element.id==='a');assert.ok(layer&&layer.kind==='video');
 const frames=new Map(scene.layers.flatMap(l=>l.kind==='video'?[[l.element.id,{sourceKey:l.source.key,timestampUs:l.timeUs,durationUs:33333,bytes:1,value:{displayWidth:100,displayHeight:100} as VideoFrame,release(){}}] as const]:[]));
 assert.throws(()=>gpuSceneDraws(scene,frames,()=>undefined),/missing its exact subject window/);
 const plan=layer.subjectWindow!,alpha=subjectWindowAlpha(plan,null);
 assert.throws(()=>gpuSceneDraws(scene,frames,()=>undefined,undefined,undefined,undefined,()=>({plan:{...plan,url:'stale'},alpha})),/missing its exact subject window/);
 const draws=gpuSceneDraws(scene,frames,()=>undefined,undefined,undefined,undefined,()=>({plan,alpha}));
 assert.equal(draws.find(draw=>draw.subjectWindow)?.subjectWindow?.alpha,alpha);
 // Before the subject starts there is no subject shape: no resource, uniform closed window.
 const early=composed([subject,{...fill('early',0),duration:.6} as TimelineElement]);
 const before=evaluateGpuScene(admitGpuScene(early,'scope','canvaskit').supported?early:[],['visual_0','visual_1'],5,320,180,'scope');
 const earlyLayer=before.layers.find(l=>l.kind==='video'&&l.element.id==='early');
 assert.ok(earlyLayer&&earlyLayer.kind==='video');assert.equal(earlyLayer.subjectWindow?.url,null);
 const earlyFrames=new Map([[earlyLayer.element.id,{sourceKey:earlyLayer.source.key,timestampUs:earlyLayer.timeUs,durationUs:33333,bytes:1,value:{displayWidth:100,displayHeight:100} as VideoFrame,release(){}}]]);
 assert.equal(gpuSceneDraws(before,earlyFrames,()=>undefined)[0]!.subjectWindow?.alpha,null);
});

test('admission explains unusable bindings',()=>{
 const issues=(elements:TimelineElement[])=>gpuSceneCapabilityIssues(composed(elements),'scope','canvaskit').filter(issue=>issue.capability==='subject-window').map(issue=>issue.reason);
 assert.deepEqual(issues([subject,fill('a',1)]),[]);
 assert.match(issues([subject,fill('a',1,{subject_window_mask:{...mask,frame_count:50}})]).join(),/does not cover/);
 assert.match(issues([subject,fill('a',1,{subject_window_mode:'sideways'})]).join(),/Unknown subject window side/);
 assert.match(issues([subject,fill('a',1,{subject_window_mask:null})]).join(),/both its subject clip and a prepared subject mask/);
});
