import test from 'node:test';
import assert from 'node:assert/strict';
import type {CompositionElement} from '../render/composition-adapters';
import {admitGpuScene,gpuSceneCapabilityIssues,CANVASKIT_IMPLEMENTED_CAPABILITIES} from '../gpu-preview/scene';
const still:CompositionElement={id:'actor',type:'still',source_url:'/fixture.png',timeline_start:0,duration:2,lane_key:'visual_0',lane_index:0,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,props:{}};
const issues=(props:Record<string,unknown>,extra:Partial<CompositionElement>={})=>gpuSceneCapabilityIssues([{...still,...extra,props}],'test','canvaskit');
test('CanvasKit explicitly implemented media presets are not blocked by WebGPU pixel gates',()=>{
 for(const preset of CANVASKIT_IMPLEMENTED_CAPABILITIES.mediaAnimations){
  const actor={...still,props:{animationIn:preset,animationOut:preset}};
  assert.equal(admitGpuScene([actor],'test','canvaskit').supported,true,preset);
  if(!['none','fade'].includes(preset))assert.equal(admitGpuScene([actor],'test').supported,false,preset);
 }
 // Caption presets on media share Standard's animation frame (neutral in, word_* fade out).
 assert.deepEqual(issues({animationIn:'handwriting',animationOut:'word_fade'}),[]);
 assert.ok(issues({animationIn:'future_animation'}).some(i=>i.capability==='media-animation'));
});
test('CanvasKit transition inventory preserves validation while admitting implemented families',()=>{
 for(const type of CANVASKIT_IMPLEMENTED_CAPABILITIES.transitions){
  const transition={type,duration_seconds:.3,params:{direction:'from-right' as const}};
  assert.equal(issues({}, {transition_in:transition}).length,0,type);
 }
 assert.ok(issues({}, {transition_in:{type:'cube',duration_seconds:.3,params:{direction:'unknown'}} as never}).some(i=>i.capability==='transitions'));
 assert.ok(issues({}, {transition_in:{type:'new_transition',duration_seconds:.3} as never}).some(i=>i.capability==='transitions'));
});
test('radial, LUT and grid admission remains explicit and checks resources/models',()=>{
 assert.deepEqual(issues({iris_radius:.8,iris_feather:.1,zoom_blur:15}),[]);
 assert.ok(issues({iris_radius:NaN}).some(i=>i.capability==='property:iris_radius'));
 assert.ok(issues({zoom_blur:41}).some(i=>i.capability==='property:zoom_blur'));
 assert.ok(issues({lut_asset_id:'bad',lut_source_url:'/x.cube'}).some(i=>i.capability==='lut'));
 assert.deepEqual(issues({color_grade_model:'linear-srgb-v1',lut_asset_id:'a'.repeat(64),lut_source_url:'/api/projects/test/media/a.cube',lut_intensity:.5}),[]);
 assert.ok(issues({grid_matte_cell_size:90}).some(i=>i.capability==='grid-matte'));
 assert.ok(issues({grid_matte_mask:{source_url:'/broken'}}).some(i=>i.capability==='grid-matte'));
 assert.deepEqual(issues({grid_matte_cell_size:90,grid_matte_mask:{source_url:'/api/projects/test/media/masks',source_start_seconds:0,fps:30,frame_count:60,width:100,height:100,source_sha256:'a'.repeat(64)},source_duration_seconds:2,preview_source_url:'/preview.mp4',preview_proxy_validation:{contract:'preview-proxy-v1',url:'/preview.mp4',ok:true,width:100,height:100}},{type:'video_clip',source_url:'/original.mp4'}),[]);
 assert.ok(issues({color_grade_model:'future-model'}).some(i=>i.capability==='color-grade'));
 assert.ok(issues({future_effect:1}).some(i=>i.capability==='property:future_effect'));
 assert.ok(issues({}, {source_url:null}).some(i=>i.capability==='source'));
});
test('CanvasKit page-turn backdrop paths admit scene and actor-local roots',()=>{
 const transition_in={type:'page_turn' as const,duration_seconds:.3};
 for(const props of [
  {zoom_blur:10},
  {zoom_blur:10,media_opacity:.7},
  {zoom_blur:10,media_opacity:.7,keyframes:{media_opacity:[{t:0,v:.7},{t:1,v:1}]}},
 ]) {
  assert.deepEqual(issues(props,{transition_in}),[]);
  // The separate custom WebGPU backend has not inherited CanvasKit coverage.
  assert.equal(admitGpuScene([{...still,transition_in,props}],'test','webgpu').supported,false);
 }
});
test('caption focus uses CanvasKit implementation without admitting unknown channels/styles',()=>{
 const caption={...still,type:'caption_text',source_url:null,props:{text:'Hello',animationIn:'focus_settle'}};
 assert.equal(admitGpuScene([caption],'test','canvaskit').supported,true);
 assert.equal(admitGpuScene([caption],'test').supported,false);
 assert.ok(issues({text:'Hello',keyframes:{fontSizePx:[{t:0,v:100}]}},{type:'caption_text',source_url:null}).some(i=>i.capability==='property:keyframes'));
});
