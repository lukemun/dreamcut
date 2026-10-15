import test from 'node:test';
import assert from 'node:assert/strict';
import CanvasKitInit from 'canvaskit-wasm';
import {canvasKitCaptionFillPlan,canvasKitAssembleCaptionFill} from '../gpu-preview/canvaskit-caption-fill';
import {evaluateGpuScene,admitGpuScene} from '../gpu-preview/scene';
import {gpuFrameDependencies} from '../gpu-preview/frame-dependencies';
import {gpuSceneDraws} from '../gpu-preview/scene-draws';
import {setGpuTextAnchor,setGpuTextBounds,setGpuTextFillRegions,setGpuTickerWidth} from '../gpu-preview/text-bounds';
import type {CompositionElement} from '../render/composition-adapters';
const actor:CompositionElement={id:'fill',type:'caption_text',source_url:null,timeline_start:0,duration:3,lane_key:'captions_0',lane_index:0,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,props:{text:'Video fill',animationIn:'handwriting',animationOut:'none',styleVariant:'image_fill',surfaceMode:'wall',surfaceBlendMode:'multiply',mediaFillVideoUrl:'/original.mp4',mediaFillVideoPreviewUrl:'/proxy.mp4',runtime_media_fill_preview:{sourceUrl:'/original.mp4',previewUrl:'/proxy.mp4',alpha:false,validation:{contract:'preview-proxy-v1',url:'/proxy.mp4',ok:true,width:64,height:64}}}};
test('wall and moving ticker video fill use one exact decoded frame and one complete actor wrapper',()=>{
 const mask={width:32,height:16} as OffscreenCanvas;setGpuTextBounds(mask,{x:80,y:90,width:32,height:16});setGpuTextAnchor(mask,[96,98]);setGpuTickerWidth(mask,32);
 setGpuTextFillRegions(mask,[{x:80,y:90,width:16,height:16,videoRect:{x:0,y:0,width:160,height:160}},{x:96,y:90,width:16,height:16,videoRect:{x:0,y:0,width:160,height:160}}]);
 for(const ticker of [false,true]){
  const element={...actor,props:{...actor.props,...(ticker?{ticker_motion:'crawl_left'}:{})}};
  assert.equal(admitGpuScene([element],'scope','canvaskit').supported,true);
  let previous:string|undefined;
  for(const frame of [30,45,15,30]){
   const scene=evaluateGpuScene([element],[],frame,160,160,'scope');const dependency=gpuFrameDependencies(scene,[element],'scope')[0];
   const source={displayWidth:64,displayHeight:64} as VideoFrame;
   const decoded={sourceKey:dependency.source.key,timestampUs:dependency.timeUs,durationUs:33334,bytes:16384,value:source,release(){}};
   const packets=gpuSceneDraws(scene,new Map([['fill',decoded]]),()=>mask);assert.equal(packets.length,1);
   const packet=packets[0];assert.equal(packet.frame,source);assert.equal(packet.captionFill?.regions.length,2);assert.equal(packet.captionMask,undefined);assert.equal(packet.textureVersion,undefined);
   assert.equal(!!packet.captionPlane,!ticker);assert.equal(packet.opacity,ticker?1:.78);
   const geometry=JSON.stringify([packet.transform,packet.captionPlane]);if(frame===30){if(previous)assert.equal(geometry,previous);previous=geometry;}
   assert.throws(()=>gpuSceneDraws(scene,new Map([['fill',{...decoded,timestampUs:dependency.timeUs+1}]]),()=>mask),/exact video frame/);
  }
 }
});
test('local fill assembly is cropped, alpha-masked once, and resets without retaining prior fill pixels',async()=>{
 const k=await CanvasKitInit(),parent=k.MakeSurface(8,8)!,source=k.MakeSurface(4,4)!,mask=k.MakeSurface(8,4)!,paint=new k.Paint();
 const input={mask:{width:8,height:4} as OffscreenCanvas,bounds:{x:100,y:-10,width:8,height:4},regions:[{rect:{x:100,y:-10,width:4,height:4},clip:[100,-10,104,-6] as const},{rect:{x:104,y:-10,width:4,height:4},clip:[104,-10,108,-6] as const}]};
 const plan=canvasKitCaptionFillPlan(input);assert.equal(plan.bytes,8*4*12);
 try{
  const mc=mask.getCanvas();mc.clear(k.TRANSPARENT);paint.setColor(k.WHITE);mc.drawRect(k.LTRBRect(1,0,7,4),paint);mask.flush();const glyph=mask.makeImageSnapshot();
  try{for(const [color,blue] of [[k.RED,false],[k.BLUE,true],[k.RED,false]] as const){
   source.getCanvas().clear(color);source.flush();const fill=source.makeImageSnapshot();
   try{const image=canvasKitAssembleCaptionFill(k,parent,fill,glyph,plan);try{
    assert.equal(image.width(),8);assert.equal(image.height(),4);
    const rgba=image.readPixels(0,0,{width:8,height:4,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB})!;
    assert.equal(rgba[3],0);assert.equal(rgba[31],0);assert.equal(rgba[7],255);
    assert.equal(rgba[4],blue?0:255);assert.equal(rgba[6],blue?255:0);
   }finally{image.delete();}}finally{fill.delete();}
  }}finally{glyph.delete();}
  assert.throws(()=>canvasKitCaptionFillPlan({...input,bounds:{...input.bounds,width:9}}),/Invalid local caption fill/);
  assert.throws(()=>canvasKitCaptionFillPlan({...input,regions:[{...input.regions[0],clip:[0,0,NaN,2]}]}),/region/);
 }finally{paint.delete();mask.delete();source.delete();parent.delete();}
});
