import test from 'node:test';
import assert from 'node:assert/strict';
import type {CompositionElement} from '../render/composition-adapters';
import {admitGpuScene,evaluateGpuScene,gpuSceneCapabilityIssues} from '../gpu-preview/scene';
import {gpuTextTextureKey} from '../gpu-preview/scene-draws';

const caption:CompositionElement={id:'fall',type:'caption_text',source_url:null,timeline_start:2,duration:3,lane_key:'captions_0',lane_index:0,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,
 props:{text:'Goulash',letter_fall_start_seconds:1,letter_fall_seconds:.45,letter_fall_stagger_seconds:.04,letter_fall_order:'outside_in'}};

test('letter fall is admitted on CanvasKit; WebGPU keeps rejecting it',()=>{
 assert.deepEqual(gpuSceneCapabilityIssues([caption],'media1','canvaskit'),[]);
 assert.equal(admitGpuScene([caption],'media1','canvaskit').supported,true);
 assert.ok(gpuSceneCapabilityIssues([caption],'media1','webgpu').some(issue=>issue.capability==='property:letter_fall_start_seconds'));
});

test('unproven letter-fall combinations and invalid timing fail closed on CanvasKit',()=>{
 const issues=(props:Record<string,unknown>)=>gpuSceneCapabilityIssues([{...caption,props:{...caption.props,...props}}],'media1','canvaskit').map(issue=>issue.capability);
 assert.deepEqual(issues({letter_fall_order:'spiral'}),['letter-fall']);
 assert.deepEqual(issues({letter_fall_seconds:0}),['letter-fall']);
 assert.deepEqual(issues({ticker_motion:'crawl_left'}),['letter-fall']);
 for(const preset of ['handwriting','word_pop','write_on'])assert.ok(issues({animationIn:preset,animationInDuration:.4}).includes('letter-fall'),preset);
 // Block entrances compose on the GPU around the per-frame glyph raster.
 assert.deepEqual(issues({animationIn:'pop',animationInDuration:.4,animationOut:'fade',animationOutDuration:.4}),[]);
});

test('letter-fall rasters key the shared fall clock: shared before release and after settling, distinct while falling',()=>{
 const at=(frame:number)=>{const layer=evaluateGpuScene([caption],[],frame,540,960,'media1').layers[0];assert.ok(layer.kind==='caption');return layer;};
 const key=(frame:number)=>gpuTextTextureKey(at(frame),'font');
 // Clip starts at frame 60; release at local 1s (frame 90).
 assert.equal(at(60).letterFallElapsed,0);
 assert.equal(key(60),key(90));
 assert.notEqual(key(90),key(91));
 assert.notEqual(key(95),key(96));
 assert.ok(Math.abs(at(96).letterFallElapsed!-.2)<1e-12);
 // Last ring releases at .12s; every glyph is clamped after .12 + .45·(√3+.01)s.
 assert.equal(key(118),key(149));
 assert.notEqual(key(116),key(118));
 const plain={...caption,props:{text:'Goulash'}};
 const layer=evaluateGpuScene([plain],[],95,540,960,'media1').layers[0];
 assert.ok(layer?.kind==='caption'&&layer.letterFallElapsed===undefined,'captions without a release clock keep one static raster');
});
