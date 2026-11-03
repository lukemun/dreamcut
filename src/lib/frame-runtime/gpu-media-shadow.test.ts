import test from 'node:test';
import assert from 'node:assert/strict';
import type {CompositionElement} from '../render/composition-adapters';
import {admitGpuScene,evaluateGpuScene,gpuSceneCapabilityIssues,CANVASKIT_IMPLEMENTED_CAPABILITIES} from '../gpu-preview/scene';
import {gpuMediaShadow,gpuMediaShadowPad} from '../gpu-preview/media-shadow';
import {CanvasKitCompositor} from '../gpu-preview/canvaskit-compositor';
import {MEDIA_SHADOW_DEFAULTS,mediaShadowCss,resolveMediaShadow} from '../timeline/media-shadow';

const SHADOW_PROPS=['media_shadow','media_shadow_blur','media_shadow_opacity','media_shadow_offset_x','media_shadow_offset_y'];
const still=(props:Record<string,unknown>):CompositionElement=>({id:'photo',type:'still',source_url:'/photo.png',timeline_start:0,duration:2,
 lane_key:'visual_0',lane_index:0,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,props});

test('authored shadow values, defaults and clamps match the Standard CSS owner',()=>{
 assert.equal(resolveMediaShadow({}),null);
 assert.equal(resolveMediaShadow({media_shadow:'true'}),null,'Only literal true enables the shadow, as in Standard');
 assert.deepEqual(resolveMediaShadow({media_shadow:true}),MEDIA_SHADOW_DEFAULTS);
 assert.deepEqual(MEDIA_SHADOW_DEFAULTS,{offsetX:0,offsetY:16,blur:28,opacity:.32});
 const clamped=resolveMediaShadow({media_shadow:true,media_shadow_offset_x:-200,media_shadow_offset_y:'9',media_shadow_blur:500,media_shadow_opacity:2})!;
 assert.deepEqual(clamped,{offsetX:-80,offsetY:16,blur:80,opacity:.8});
 assert.equal(mediaShadowCss(resolveMediaShadow({media_shadow:true})!),'0px 16px 28px rgba(0, 0, 0, 0.32)');
});

test('GPU shadow carries CSS blur radius, offset and opacity through media scale and source orientation',()=>{
 // A CSS drop-shadow() blur length is the Gaussian stdDeviation itself (not box-shadow's r/2).
 assert.deepEqual(gpuMediaShadow({media_shadow:true},1),{dx:0,dy:16,sigma:28,opacity:.32});
 const authored={media_shadow:true,media_shadow_offset_x:10,media_shadow_offset_y:20,media_shadow_blur:8,media_shadow_opacity:.5};
 assert.deepEqual(gpuMediaShadow(authored,2),{dx:20,dy:40,sigma:16,opacity:.5},'Shadow lives inside the media-scale wrapper');
 assert.deepEqual(gpuMediaShadow({...authored,media_mirror:'horizontal'},1),{dx:-10,dy:20,sigma:8,opacity:.5},'Mirror flips the authored offset');
 // CSS rotate(90deg) in y-down space maps (x, y) to (-y, x).
 assert.deepEqual(gpuMediaShadow({...authored,media_orientation:'clockwise'},1),{dx:-20,dy:10,sigma:8,opacity:.5});
 assert.deepEqual(gpuMediaShadow({...authored,media_orientation:'counterclockwise'},1),{dx:20,dy:-10,sigma:8,opacity:.5});
 assert.equal(gpuMediaShadow({...authored,media_shadow_opacity:0},1),undefined,'A transparent shadow draws nothing');
 assert.equal(gpuMediaShadow({media_shadow:false},1),undefined);
 assert.throws(()=>gpuMediaShadow(authored,0),/Invalid GPU media shadow scale/);
 assert.equal(gpuMediaShadowPad({dx:-20,dy:10,sigma:4,opacity:.5}),32);
 assert.equal(gpuMediaShadowPad(undefined),0);
});

test('GPU scene draws carry the shadow at the actor media scale',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const element=still({media_shadow:true,media_shadow_offset_x:4,media_shadow_blur:10,media_scale:1.5});
 const admission=admitGpuScene([element],'media1','canvaskit');assert.equal(admission.supported,true);
 const scene=evaluateGpuScene(admission.supported?admission.elements:[],[],10,100,100,'media1'),layer=scene.layers[0];
 if(layer.kind!=='video')throw Error('missing picture');
 const frames=new Map([[element.id,{sourceKey:layer.source.key,timestampUs:0,durationUs:1e9,bytes:4,value:{displayWidth:100,displayHeight:100} as VideoFrame,release(){}}]]);
 assert.deepEqual(gpuSceneDraws(scene,frames,()=>undefined)[0].shadow,{dx:6,dy:24,sigma:15,opacity:.32});
 const plain=evaluateGpuScene([still({})],[],10,100,100,'media1');
 assert.equal(gpuSceneDraws(plain,frames,()=>undefined)[0].shadow,undefined);
});

test('media shadow is a CanvasKit capability and stays rejected on WebGPU',()=>{
 for(const key of SHADOW_PROPS)assert.ok((CANVASKIT_IMPLEMENTED_CAPABILITIES.extraMediaProperties as readonly string[]).includes(key),key);
 const element=still({media_shadow:true,media_shadow_blur:12,media_shadow_opacity:.4,media_shadow_offset_x:3,media_shadow_offset_y:9});
 assert.deepEqual(gpuSceneCapabilityIssues([element],'media1','canvaskit'),[]);
 assert.deepEqual(gpuSceneCapabilityIssues([element],'media1','webgpu').map(issue=>issue.capability).sort(),SHADOW_PROPS.map(key=>`property:${key}`).sort());
});

test('malformed CanvasKit shadow rejects before any private frame draw',()=>{
 const compositor=Object.assign(Object.create(CanvasKitCompositor.prototype),{
  closed:false,lost:false,baseBytes:8,activeBytes:0,cacheBudgetBytes:32,colorBudgetBytes:8,colors:{bytes:4},budgetBytes:1e6,
  kit:{BlendMode:{SrcOver:3}},canvas:{width:2,height:2},stage:{width:2,height:2},
  graphics:{getResourceCacheUsageBytes:()=>0,setResourceCacheLimitBytes:()=>{}},
  surface:{getCanvas:()=>assert.fail('Invalid shadow must not begin drawing')},
 }) as CanvasKitCompositor;
 const layer={frame:{width:1,height:1} as OffscreenCanvas,transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],opacity:1};
 for(const shadow of [{dx:NaN,dy:0,sigma:1,opacity:.3},{dx:0,dy:0,sigma:-1,opacity:.3},{dx:0,dy:0,sigma:1,opacity:2}])
  assert.throws(()=>compositor.draw([{...layer,shadow}]),/Invalid CanvasKit media shadow/);
});
