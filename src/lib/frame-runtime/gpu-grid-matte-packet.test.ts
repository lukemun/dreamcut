import test from 'node:test';
import assert from 'node:assert/strict';
import type {CompositionElement} from '../render/composition-adapters';
import {evaluateGpuScene} from '../gpu-preview/scene';
import {gpuSceneDraws} from '../gpu-preview/scene-draws';
import {canvasKitGridMattePlan} from '../gpu-preview/canvaskit-grid-matte';
const video:CompositionElement={id:'grid',type:'video_clip',source_url:'/original.mp4',timeline_start:2,duration:2,lane_key:'visual_0',lane_index:0,volume:0,trim_start:3,trim_end:null,playback_rate:2,fade_in:0,fade_out:0,
 props:{source_duration_seconds:8,preview_source_url:'/preview.mp4',preview_proxy_validation:{contract:'preview-proxy-v1',url:'/preview.mp4',ok:true,width:100,height:100},grid_matte_cell_size:360,grid_matte_mask:{source_url:'/api/projects/test/media/masks',source_start_seconds:3,fps:10,frame_count:40,width:100,height:100,source_sha256:'0'.repeat(64)},iris_radius:1,iris_feather:.2,zoom_blur:20}};
test('packet grid dependency uses retimed source clock and refuses stale cell masks',()=>{
 const scene=evaluateGpuScene([video],[],75,320,320,'scope'),layer=scene.layers[0];assert.equal(layer.kind,'video');if(layer.kind!=='video')return;
 assert.equal(layer.timeUs,4016666);
 const frames=new Map([[video.id,{sourceKey:layer.source.key,timestampUs:layer.timeUs,durationUs:33333,bytes:1,value:{displayWidth:100,displayHeight:100} as VideoFrame,release(){}}]]);
 assert.throws(()=>gpuSceneDraws(scene,frames,()=>undefined),/missing its exact grid matte/);
 const plan=canvasKitGridMattePlan(video.props,4,320,320)!,resource={plan,rgba:new Uint8Array(plan.columns*plan.rows*4)};
 const draw=gpuSceneDraws(scene,frames,()=>undefined,undefined,()=>resource)[0];
 assert.equal(draw.gridMatte?.plan.url,'/api/projects/test/media/masks/00010.png');
 assert.deepEqual(draw.radial?.iris,[1,.2]);assert.equal(draw.radial?.edgeBlurSigma,20*320/1080);
 assert.throws(()=>gpuSceneDraws(scene,frames,()=>undefined,undefined,()=>({...resource,plan:{...plan,url:'stale'}})),/missing its exact grid matte/);
});
