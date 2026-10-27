import test from 'node:test';
import assert from 'node:assert/strict';
import type {CompositionElement} from '../render/composition-adapters';
import {evaluateGpuScene,gpuSceneCapabilityIssues} from '../gpu-preview/scene';
import {gpuOuterTransform} from '../gpu-preview/spiral-transform';
import {cameraMatrix,composeAffine,type Affine} from '../timeline/camera';
import {gpuSpiralTransform} from '../gpu-preview/spiral-transform';

const base={timeline_start:0,duration:4,lane_index:0,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0};
const camera={...base,id:'cam',type:'shape',source_url:null,lane_key:'visual_9',props:{shape_kind:'camera',media_scale:2,media_offset_x:.5}} as CompositionElement;
const video={...base,id:'clip',type:'video_clip',source_url:'/original.mp4',lane_key:'visual_0',
 props:{camera_id:'cam',source_duration_seconds:4,preview_source_url:'/preview.mp4',preview_proxy_validation:{contract:'preview-proxy-v1',url:'/preview.mp4',ok:true,width:100,height:100}}} as CompositionElement;
const text={...base,id:'label',type:'caption_text',source_url:null,lane_key:'captions_0',props:{text:'City',camera_id:'cam'}} as CompositionElement;

test('clips and text that follow a camera carry its view; the camera itself draws nothing',()=>{
 const scene=evaluateGpuScene([camera,video,text],[],30,320,180,'media1');
 assert.deepEqual(scene.layers.map(layer=>layer.kind).sort(),['caption','video']);
 for(const layer of scene.layers)if(layer.kind==='video'||layer.kind==='caption')assert.deepEqual([layer.camera?.zoom,layer.camera?.focusX],[2,240]);
 const alone=evaluateGpuScene([{...video,props:{...video.props,camera_id:undefined}}],[],30,320,180,'media1').layers[0];
 assert.ok(alone.kind==='video'&&alone.camera===undefined);
});

test('the camera is the outermost transform, around any spiral group',async()=>{
 const view={focusX:240,focusY:90,zoom:2,rotationDeg:0};
 assert.deepEqual(gpuOuterTransform(undefined,0,320,180,view)?.matrix,cameraMatrix(view,320,180));
 const spiral={origin_x:.5,origin_y:.5,start_seconds:0,duration_seconds:2,turns:1};
 const inner=gpuSpiralTransform(spiral,1,320,180)!;
 assert.deepEqual(gpuOuterTransform(spiral,1,320,180,view)?.matrix,composeAffine(cameraMatrix(view,320,180),inner.matrix as Affine));
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const scene=evaluateGpuScene([camera,text],[],30,320,180,'media1');
 const draw=gpuSceneDraws(scene,new Map(),()=>({width:320,height:180}) as OffscreenCanvas)[0];
 assert.deepEqual(draw.outerSpiral?.matrix,cameraMatrix(view,320,180));
});

test('CanvasKit admits camera followers, except where Standard would draw them differently',()=>{
 const issues=(elements:CompositionElement[])=>gpuSceneCapabilityIssues(elements,'media1','canvaskit').filter(issue=>issue.capability==='camera'||issue.capability==='property:camera_id');
 assert.deepEqual(issues([camera,video,text]),[]);
 const faded={...video,transition_out:{type:'fade',duration_seconds:.5,to_element_id:'x'}} as unknown as CompositionElement;
 assert.equal(issues([camera,faded])[0]?.capability,'camera');
});
