import test from 'node:test';
import assert from 'node:assert/strict';
import type {TimelineElement, TimelineTransition} from '../../components/studio/timeline/types';
import {gpuTimelineCapabilityInventory} from '../gpu-preview/capability-inventory';

const actor = (id: string, start: number): TimelineElement => ({
  id, project_id:'fixture', type:'still', source_url:'/fixture.png', props:{},
  beat_id:null, voice_clip_id:null, character_id:null, timeline_start:start, duration:2,
  lane_key:'visual_0', lane_index:0, trim_start:0, trim_end:null, volume:0, fade_in:0, fade_out:0,
  playback_rate:1, position_locked:false, removed_at:null, removed_reason:null,
  created_at:'2026-01-01T00:00:00Z', updated_at:'2026-01-01T00:00:00Z',
});
const transition: TimelineTransition = {id:'join', project_id:'fixture', from_element_id:'a', to_element_id:'b',
  type:'cube', duration_seconds:.2, params:{direction:'from-right'},
  removed_at:null, removed_reason:null, created_at:'2026-01-01T00:00:00Z', updated_at:'2026-01-01T00:00:00Z'};

test('saved top-level transitions cannot vanish from GPU capability inventory', () => {
  const elements = [actor('a',0), actor('b',2)];
  const before = JSON.stringify({elements,transition});
  const report = gpuTimelineCapabilityInventory(elements,[transition],'inventory');
  assert.equal(report.actorCount,2);
  assert.deepEqual(report.transitionCounts,{cube:1});
  assert.equal(report.counts.transitions,2);
  assert.deepEqual(report.issues.map(issue=>issue.elementId),['a','b']);
  assert.equal(JSON.stringify({elements,transition}),before);
});

test('verified transitions remain counted after production projection without false blockers',()=>{
 const verified={...transition,type:'whip' as const,params:{motion:'smear' as const,direction:'from-right' as const,smear_zoom_percent:0,smear_travel_percent:100,whip_blur_strength:2}};
 const report=gpuTimelineCapabilityInventory([actor('a',0),actor('b',2)],[verified],'inventory');
 assert.deepEqual(report.transitionCounts,{whip:1});assert.equal(report.issueCount,0);
});

test('removed, invalid and hidden+muted joins do not create false inventory blockers', () => {
  const elements = [actor('a',0),actor('b',2),{...actor('removed',4),removed_at:'2026-01-02'}];
  assert.equal(gpuTimelineCapabilityInventory(elements,[{...transition,removed_at:'2026-01-02'}],'inventory').issueCount,0);
  assert.equal(gpuTimelineCapabilityInventory(elements,[{...transition,to_element_id:'removed'}],'inventory').issueCount,0);
  assert.equal(gpuTimelineCapabilityInventory([elements[0],actor('b',3)],[transition],'inventory').issueCount,0);
  // Mute alone keeps pictures; a lane that is both muted and hidden contributes no actor.
  const muted = gpuTimelineCapabilityInventory(elements,[transition],'inventory',new Set(['visual_0']),'webgpu',new Set(['visual_0']));
  assert.equal(muted.actorCount,0);
  assert.deepEqual(muted.transitionCounts,{});
  assert.equal(muted.issueCount,0);
});

test('inventory checks future actors after disabled and outline projection', () => {
  const elements = [actor('a',0),{...actor('b',20),props:{zoom_blur:12}},
    {...actor('disabled',40),props:{disabled:true,future_effect:1}}];
  const report = gpuTimelineCapabilityInventory(elements,[],'inventory');
  assert.equal(report.actorCount,2);
  assert.deepEqual(report.counts,{'property:zoom_blur':1});
});

test('inventory reports explicit drawing engine without weakening the WebGPU default',()=>{
 const elements=[{...actor('a',0),props:{animationIn:'pop'}},actor('b',2)];
 const standard=gpuTimelineCapabilityInventory(elements,[transition],'inventory');
 const canvasKit=gpuTimelineCapabilityInventory(elements,[transition],'inventory',new Set(),'canvaskit');
 assert.equal(standard.engine,'webgpu');assert.ok(standard.issueCount>0);
 assert.equal(canvasKit.engine,'canvaskit');assert.equal(canvasKit.issueCount,0);assert.deepEqual(canvasKit.transitionCounts,{cube:1});
});

test('inventory admits media drop shadow and caption source size on CanvasKit only where implemented',()=>{
 const shadow={media_shadow:true,media_shadow_blur:20,media_shadow_opacity:.4,media_shadow_offset_x:4,media_shadow_offset_y:12};
 const elements=[{...actor('a',0),props:{...shadow,source_width:1080,source_height:1920}},
  {...actor('caption',0),type:'caption_text' as const,source_url:null,lane_key:'captions_0',props:{text:'Hi',source_width:1080,source_height:1350}}];
 assert.equal(gpuTimelineCapabilityInventory(elements,[],'inventory',new Set(),'canvaskit').issueCount,0);
 const webgpu=gpuTimelineCapabilityInventory(elements,[],'inventory');
 assert.deepEqual(Object.keys(webgpu.counts).sort(),Object.keys(shadow).map(key=>`property:${key}`).sort());
});

test('CanvasKit inventory admits outline layers, SVG stills, media reveals, compound receipts and inert media surface props',()=>{
 const proxy={source_duration_seconds:4,preview_source_url:'/preview.webm',preview_proxy_validation:{contract:'preview-proxy-v1',url:'/preview.webm',ok:true,width:100,height:100}};
 const subject={...actor('subject',0),type:'video_clip' as const,source_url:'/cutout.webm',props:{...proxy,has_alpha:true,compound_clip_id:'c1',compound_preview:{id:'c1',source_url:'/compound.webm',members:[]}}};
 const outline={...actor('outline',0),type:'video_clip' as const,source_url:'/cutout.webm',lane_key:'visual_1',lane_index:1,
  props:{outline_parent_id:'subject',outline_mask:{source_url:'/api/projects/p/media/outline-masks/abc',frame_count:60,fps:30,width:100,height:100,source_sha256:'a'.repeat(64)},outline_width:8,outline_color:'#ffffff'}};
 const art={...actor('art',2),source_url:'/api/projects/p/media/sources/year-1.svg',props:{animationIn:'write_on',animationInDuration:.4,animationOut:'scan_reveal_down',animationOutDuration:.4}};
 const wall={...actor('wall',4),type:'video_clip' as const,source_url:'/clip.mp4',props:{...proxy,surfaceMode:'wall',surfacePerspectivePx:1200,surfaceRotateZDeg:-8}};
 const canvasKit=gpuTimelineCapabilityInventory([subject,outline,art,wall],[],'inventory',new Set(),'canvaskit');
 assert.equal(canvasKit.actorCount,4);
 assert.deepEqual(canvasKit.counts,{});
 // The custom WebGPU backend has not inherited these CanvasKit implementations.
 const webgpu=gpuTimelineCapabilityInventory([subject,outline,art,wall],[],'inventory');
 assert.ok(webgpu.counts['property:outline_mask']===1&&webgpu.counts['media-animation']>=1);
});
