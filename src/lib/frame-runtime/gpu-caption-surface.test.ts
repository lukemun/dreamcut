import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import CanvasKitInit from 'canvaskit-wasm';
import {FrameContext,FrameSession} from './index';
import {CaptionSequence} from '../remotion/TimelineComposition';
import {admitGpuScene,evaluateGpuScene} from '../gpu-preview/scene';
import {setGpuTextAnchor} from '../gpu-preview/text-bounds';
import {gpuSceneDraws} from '../gpu-preview/scene-draws';
import {gpuCaptionRasterElement} from '../gpu-preview/caption-raster-element';
import {canvasKitBlendMode} from '../gpu-preview/canvaskit-blend';
import {GpuVideoCompositor} from '../gpu-preview/compositor';
import type {CompositionElement} from '../render/composition-adapters';
const actor:CompositionElement={id:'caption',type:'caption_text',source_url:null,timeline_start:0,duration:3,lane_key:'captions_0',lane_index:0,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,props:{text:'Wall',animationIn:'none',animationOut:'none',styleVariant:'none'}};
const element=(props:Record<string,unknown>)=>({...actor,props:{...actor.props,...props}});
const scene=(props:Record<string,unknown>)=>evaluateGpuScene([element(props)],[],30,320,568,'fixture');
test('ordinary wall captions admit CanvasKit only; malformed controls and unverified video sources fail closed',()=>{
 for(const props of [{surfaceMode:'wall'},{surface_attached:true},{surfaceMode:'wall',surfaceBlendMode:'multiply',surfaceRotateYDeg:12},{surfaceMode:'wall',animationIn:'fade'},{surfaceMode:'wall',animationIn:'rotate_in'},{surfaceMode:'wall',styleVariant:'camera_reveal'},{surfaceMode:'wall',styleVariant:'benchmark_card'}]){
  assert.equal(admitGpuScene([element(props)],'fixture','canvaskit').supported,true);
  assert.equal(admitGpuScene([element(props)],'fixture','webgpu').supported,false);
 }
 for(const props of [{surfaceMode:'ceiling'},{surfaceMode:'wall',surfaceBlendMode:'screen'},{surfaceMode:'wall',surfaceBlurPx:NaN},{surfaceMode:'wall',styleVariant:'image_fill',animationIn:'handwriting',mediaFillVideoUrl:'/a.mp4',mediaFillVideoPreviewUrl:'/p.mp4'}])assert.equal(admitGpuScene([element(props)],'fixture','canvaskit').supported,false);
});
test('wall raster retains shadow while its complete plane/filter/opacity wrapper moves to GPU',()=>{
 const current=scene({surface_attached:true,surfaceRotateYDeg:12}).layers[0];assert.equal(current.kind,'caption');if(current.kind!=='caption')return;
 const raster=gpuCaptionRasterElement(current);assert.equal(raster.props.surfaceBlendMode,'normal');assert.equal(raster.props.surface_attached,true);
 const session=new FrameSession();try{
  const html=renderToStaticMarkup(React.createElement(FrameContext.Provider,{value:{frame:30,fps:30,width:320,height:568,durationInFrames:90,rendering:true,playing:false,muted:true,volume:0,playbackRate:1,session}},React.createElement(CaptionSequence,{element:raster,sourceAspectRatio:null,renderScale:1})));
  assert.match(html,/mix-blend-mode:normal/);assert.match(html,/opacity:1/);assert.doesNotMatch(html,/filter:blur/);assert.doesNotMatch(html,/perspective\(|translateZ|rotateY/);assert.match(html,/rotateZ\(0deg\) skew\(0deg, 0deg\) scale\(1, 1\)/);assert.match(html,/text-shadow:0 1px 0 rgba\(255,255,255,0\.24\)/);
 }finally{session.dispose();}
});
test('isolated inner wall blend never overrides the shared outer caption blend',()=>{
 const canvas={width:320,height:568} as OffscreenCanvas;setGpuTextAnchor(canvas,[160,284]);
 for(const [props,blend]of [[{styleVariant:'inverse'},'difference'],[{surfaceMode:'wall',styleVariant:'inverse'},'difference'],[{surface_attached:true,styleVariant:'inverse'},'difference']]as const){
  const draws=gpuSceneDraws(scene(props),new Map(),()=>canvas);assert.equal(draws[0].blend,blend);assert.equal(draws[0].opacity,'surfaceMode' in props||'surface_attached' in props? .78:1);
 }
 assert.throws(()=>GpuVideoCompositor.prototype.draw.call({closed:false,pipelinesReady:true} as never,[{blend:'multiply'} as never]),/Invalid GPU blend mode/);
});
test('CanvasKit final actor multiply blends translucent foreground with the actual colored backdrop',async()=>{
 const k=await CanvasKitInit(),surface=k.MakeSurface(2,2)!;
 const draw=(blend:'normal'|'multiply')=>{
  const c=surface.getCanvas();c.clear(k.Color(128,192,64));
  const outer=new k.Paint(),ink=new k.Paint();try{
   outer.setBlendMode(canvasKitBlendMode(k,blend));outer.setAlphaf(.5);c.saveLayer(outer);
   ink.setColor(k.Color(64,128,255));c.drawRect(k.LTRBRect(0,0,1,2),ink);c.restore();surface.flush();
   const image=surface.makeImageSnapshot();try{return new Uint8Array(image.readPixels(0,0,{width:2,height:2,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB})!);}finally{image.delete();}
  }finally{outer.delete();ink.delete();}
 };
 try{
  const normal=draw('normal'),multiply=draw('multiply');
  const expected=[128*(.5+.5*64/255),192*(.5+.5*128/255),64,255];
  expected.forEach((v,i)=>assert.ok(Math.abs(multiply[i]-v)<=1,`${i}: ${multiply[i]} vs ${v}`));
  assert.notDeepEqual(multiply.slice(0,4),normal.slice(0,4));
  assert.deepEqual([...multiply.slice(4,8)],[128,192,64,255],'Transparent part does not affect backdrop');
 }finally{surface.delete();}
});

test('viewport mask is acquired by actor identity independently of glyph raster and reset removes it',()=>{
 const current=scene({text_mask_url:'/mask.png'}),raster={width:320,height:568} as OffscreenCanvas,mask={width:10,height:10} as OffscreenCanvas;
 assert.equal(admitGpuScene([element({text_mask_url:'/mask.png'})],'fixture','canvaskit').supported,true);
 assert.equal(admitGpuScene([element({text_mask_url:'/mask.png'})],'fixture','webgpu').supported,false);
 assert.throws(()=>gpuSceneDraws(current,new Map(),()=>raster),/mask is not ready/);
 const maskedLayer=current.layers[0];if(maskedLayer.kind==='caption')assert.equal(gpuCaptionRasterElement(maskedLayer).props.text_mask_url,undefined);
 const packets=gpuSceneDraws(current,new Map(),()=>raster,undefined,undefined,id=>{assert.equal(id,'caption');return mask;});
 assert.equal(packets[0].viewportMask,mask);
 assert.equal(gpuSceneDraws(scene({}),new Map(),()=>raster)[0].viewportMask,undefined);
 for(const props of [{scan_reveal_line:true},{styleVariant:'camera_reveal'}]){const layer=scene({...props,text_mask_url:'/mask.png'}).layers[0];assert.equal(layer.kind,'caption');if(layer.kind==='caption')assert.equal(layer.viewportMaskUrl,undefined);}
});

test('wall text stays visible over black because inner Multiply is isolated from scene background',async()=>{
 const k=await CanvasKitInit(),surface=k.MakeSurface(8,8)!,paint=new k.Paint(),ink=new k.Paint();
 const canvas={width:320,height:568} as OffscreenCanvas;setGpuTextAnchor(canvas,[160,284]);
 const packet=gpuSceneDraws(scene({surfaceMode:'wall',surfaceBlendMode:'multiply',textColor:'#e85020'}),new Map(),()=>canvas)[0];
 assert.equal(packet.blend,'normal');
 try{
  const c=surface.getCanvas();c.clear(k.BLACK);paint.setBlendMode(canvasKitBlendMode(k,packet.blend));paint.setAlphaf(packet.opacity);
  c.saveLayer(paint);ink.setColor(k.Color(232,80,32));c.drawRect(k.LTRBRect(1,1,7,7),ink);c.restore();surface.flush();
  const image=surface.makeImageSnapshot();try{
   const rgba=image.readPixels(0,0,{width:8,height:8,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB})!;
   const center=(4*8+4)*4;assert.ok(rgba[center]>175,'Orange text must not disappear into black');assert.ok(rgba[center+1]>55);assert.ok(rgba[center+2]>20);
   assert.deepEqual([...rgba.slice(0,4)],[0,0,0,255]);
  }finally{image.delete();}
 }finally{paint.delete();ink.delete();surface.delete();}
});
