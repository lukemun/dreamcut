import test from 'node:test';
import assert from 'node:assert/strict';
import {gpuFrameDependencies,uniqueGpuFrameDependencies} from '../gpu-preview/frame-dependencies';
import {GpuFrameController} from '../gpu-preview/frame-controller';
import {FrameStore} from '../gpu-preview/frame-store';
import {resolveGpuVideoSource} from '../gpu-preview/source';
import {evaluateGpuScene} from '../gpu-preview/scene';
import type {CompositionElement} from '../render/composition-adapters';

const picture:CompositionElement={id:'picture',type:'video_clip',source_url:'/original.mp4',timeline_start:0,duration:4,lane_key:'visual_0',lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0,props:{preview_source_url:'/prepared.mp4',preview_proxy_validation:{contract:'preview-proxy-v1',url:'/prepared.mp4',ok:true,width:320,height:180}}};
const caption:CompositionElement={...picture,id:'caption',type:'caption_text',source_url:null,lane_key:'captions_0',props:{text:'VIDEO',styleVariant:'image_fill',animationIn:'handwriting',mediaFillVideoUrl:'/export-only.mp4',mediaFillVideoPreviewUrl:'/prepared.mp4',mediaFillVideoPlaybackRate:1,mediaFillScene:{startSeconds:0,x:0,y:0,width:1,height:1}}};
const elements=[picture,caption];
const scene=(frame=15,items=elements)=>evaluateGpuScene(items,[],frame,320,180,'scope');

test('picture and caption retain separate slots but share verified decoder identity and one decode request',()=>{
 const needs=gpuFrameDependencies(scene(),elements,'scope');
 assert.deepEqual(needs.map(item=>item.slot),['picture','caption']);
 assert.deepEqual(needs[0].source,needs[1].source);
 assert.equal(needs[0].timeUs,516666);assert.equal(needs[1].timeUs,516666);
 assert.equal(uniqueGpuFrameDependencies(needs).length,1);
});
test('caption with a different clock holds the complete packet until both moments are ready',()=>{
 const items=[picture,{...caption,props:{...caption.props,mediaFillVideoPlaybackRate:.5}}];
 const needs=gpuFrameDependencies(scene(15,items),items,'scope');
 assert.equal(uniqueGpuFrameDependencies(needs).length,2);
 assert.deepEqual(needs.map(item=>item.timeUs),[516666,249999]);
 const controller=new GpuFrameController(new FrameStore<number>(16));
 const ticket=controller.request('scope',15,needs.map(item=>({slot:item.slot,sourceKey:item.source.key,timeUs:item.timeUs})));
 let releases=0;
 const offer=(timestampUs:number)=>controller.offer(ticket,{sourceKey:needs[0].source.key,timestampUs,durationUs:33333,bytes:4,value:timestampUs,release(){releases++;}});
 offer(500000);assert.equal(controller.acquire(ticket),null,'No partial picture before fill frame');
 offer(233333);const packet=controller.acquire(ticket)!;assert.ok(packet);
 assert.equal(packet.frames.get('picture')?.value,500000);assert.equal(packet.frames.get('caption')?.value,233333);
 controller.invalidatePending();let drawn=false;
 assert.equal(controller.submit(packet,()=>{drawn=true;}),false);assert.equal(drawn,false);
 controller.close();assert.equal(releases,2);
});
test('caption can reuse an inactive verified source while retaining scene-relative source time',()=>{
 const items=[{...picture,duration:.2},{...caption,timeline_start:1,props:{...caption.props,mediaFillVideoPlaybackRate:.5}}];
 const needs=gpuFrameDependencies(scene(45,items),items,'scope');
 assert.equal(needs.length,1);assert.equal(needs[0].slot,'caption');assert.equal(needs[0].timeUs,749999);
 assert.deepEqual(needs[0].source,resolveGpuVideoSource(items[0],'scope'));
});
test('caption never substitutes an export original or trusts a bare unverified proxy URL',()=>{
 const missing={...caption,props:{...caption.props,mediaFillVideoPreviewUrl:''}};
 assert.throws(()=>gpuFrameDependencies(scene(15,[missing]),[missing],'scope'),/prepared preview source/);
 assert.throws(()=>gpuFrameDependencies(scene(15,[caption]),[caption],'scope'),/matching verified/);
 const invalid={...picture,props:{...picture.props,preview_proxy_validation:{ok:true}}};
 assert.throws(()=>gpuFrameDependencies(scene(15,[caption]),[invalid,caption],'scope'),/matching verified/);
});
test('caption reuses alpha policy and media scope invalidates its source identity',()=>{
 const alpha={...picture,props:{...picture.props,has_alpha:true}};
 const a=gpuFrameDependencies(scene(15,[caption]),[alpha,caption],'scope')[0];
 const b=gpuFrameDependencies(scene(15,[caption]),[alpha,caption],'new-scope')[0];
 assert.equal(a.source.alpha,true);assert.notEqual(a.source.key,b.source.key);
});

test('video-filled captions enter GPU admission only with shared verified source authority',async()=>{
 const {admitGpuScene,gpuSceneCapabilityIssues}=await import('../gpu-preview/scene');
 assert.equal(admitGpuScene(elements,'scope').supported,true);
 assert.equal(admitGpuScene([caption],'scope').supported,false);
 assert.ok(gpuSceneCapabilityIssues([caption],'scope').some(issue=>issue.capability==='caption-fill-source'));
 const missing={...caption,props:{...caption.props,mediaFillVideoPreviewUrl:''}};
 assert.equal(admitGpuScene([picture,missing],'scope').supported,false);
});

test('standalone caption preview uses disposable validated evidence and rejects changed identities',async()=>{
 const {admitGpuScene}=await import('../gpu-preview/scene');
 const evidence={sourceUrl:'/export-only.mp4',previewUrl:'/prepared.mp4',alpha:false,validation:picture.props!.preview_proxy_validation};
 const standalone={...caption,props:{...caption.props,runtime_media_fill_preview:evidence}};
 assert.equal(admitGpuScene([standalone],'scope').supported,true);
 const needs=gpuFrameDependencies(scene(15,[standalone]),[standalone],'scope');
 assert.equal(needs[0].source.url,'/prepared.mp4');
 for(const patch of [{mediaFillVideoUrl:'/changed.mp4'},{mediaFillVideoPreviewUrl:'/changed-proxy.mp4'},{runtime_media_fill_preview:{...evidence,validation:{...evidence.validation as object,ok:false}}}]){
  const changed={...standalone,props:{...standalone.props,...patch}};
  assert.equal(admitGpuScene([changed],'scope').supported,false);
 }
});

test('picture-only browser projection preserves standalone caption proof and invalidates replaced fill bytes',async()=>{
 const {preparedPictureInput,preparedPreviewIdentity}=await import('../timeline/prepared-preview');
 const {admitGpuScene}=await import('../gpu-preview/scene');
 const {stripRuntimePreviewProps}=await import('../timeline/runtime-preview-props');
 const evidence={sourceUrl:'/export-only.mp4',previewUrl:'/prepared.mp4',alpha:false,validation:{...picture.props!.preview_proxy_validation as object,revision:'first'}};
 const standalone={...caption,props:{...caption.props,runtime_media_fill_preview:evidence,runtime_preview_preparation:{state:'ready'}}};
 const input={width:320,height:180,fps:30,durationInFrames:120,inputProps:{elements:[standalone]}};
 // TimelinePlaybackShell uses this exact projection before GPU admission.
 const projected=preparedPictureInput(input).inputProps.elements;
 assert.deepEqual(projected[0].props?.runtime_media_fill_preview,evidence);
 assert.equal(projected[0].props?.runtime_preview_preparation,undefined);
 assert.equal(admitGpuScene(projected,'scope','canvaskit').supported,true);
 assert.equal(gpuFrameDependencies(scene(15,projected),projected,'scope')[0].source.url,'/prepared.mp4');
 assert.equal(stripRuntimePreviewProps(projected[0].props).runtime_media_fill_preview,undefined,'Disposable proof still never enters durable timeline');
 const revised={...standalone,props:{...standalone.props,runtime_media_fill_preview:{...evidence,validation:{...evidence.validation,revision:'replacement'}}}};
 assert.notEqual(preparedPreviewIdentity(input),preparedPreviewIdentity({...input,inputProps:{elements:[revised]}}));
 for(const patch of [{mediaFillVideoUrl:'/changed.mp4'},{mediaFillVideoPreviewUrl:'/changed-proxy.mp4'},{runtime_media_fill_preview:{...evidence,validation:{...evidence.validation,ok:false}}}]){
  const stale=preparedPictureInput({...input,inputProps:{elements:[{...standalone,props:{...standalone.props,...patch}}]}}).inputProps.elements;
  assert.equal(admitGpuScene(stale,'scope','canvaskit').supported,false,'Projection cannot revive a stale or invalid receipt');
 }
});
test('export samples originals where the preview proxy frame came from; preview samples the same slot of its proxy',()=>{
 const preview=gpuFrameDependencies(scene(),elements,'scope');
 // WebM proxies round timestamps to milliseconds; just before the slot midpoint is inside the slot either way.
 assert.deepEqual(preview.map(item=>item.timeUs),[516666,516666]);
 const exported=evaluateGpuScene(elements,[],15,320,180,'scope',30,true);
 const needs=gpuFrameDependencies(exported,elements,'scope',true);
 // Slot 15 spans [500000, 533333) µs; its midpoint selects the frame ffmpeg put in the proxy.
 assert.equal(needs[0].timeUs,516666);
 const layer=exported.layers.find(item=>item.kind==='video')!;
 assert.equal(layer.kind==='video'&&layer.sourceTimeSeconds,.5,'derived assets keep the authored clock');
 // Picture and caption fill of one original still decode once at one time.
 assert.equal(needs[1].timeUs,516666,'caption video fill uses the same export sampling');
});
