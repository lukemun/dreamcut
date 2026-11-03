import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {FrameContext,FrameSession} from './index';
import {CaptionSequence} from '../remotion/TimelineComposition';
import {admitGpuScene,evaluateGpuScene} from '../gpu-preview/scene';
import {gpuTextTextureKey} from '../gpu-preview/scene-draws';
import {gpuCaptionRasterElement} from '../gpu-preview/caption-raster-element';
import type {CompositionElement} from '../render/composition-adapters';
const actor:CompositionElement={id:'keywords',type:'caption_text',source_url:null,timeline_start:2,duration:2,lane_key:'captions_0',lane_index:0,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,props:{text:'try our chai latte',animationIn:'none',animationOut:'none',styleVariant:'bold_outline',keywordWords:[2,3],keywordColor:'#22c55e',keywordScale:1.3,keywordUppercase:true}};
function at(frame:number,props:Record<string,unknown>={}){
 const layer=evaluateGpuScene([{...actor,props:{...actor.props,...props}}],[],frame+60,320,568,'fixture').layers[0];assert.ok(layer.kind==='caption');return layer;
}
function html(frame:number,props:Record<string,unknown>={}){
 const layer=at(frame,props),session=new FrameSession();
 try{return renderToStaticMarkup(React.createElement(FrameContext.Provider,{value:{frame:layer.rasterFrame,fps:30,width:320,height:568,durationInFrames:60,rendering:true,playing:false,muted:true,volume:0,playbackRate:1,session}},React.createElement(CaptionSequence,{element:gpuCaptionRasterElement(layer),sourceAspectRatio:null,renderScale:1})));}finally{session.dispose();}
}
test('keywords draw in their colour, size and capitals on CanvasKit; other words stay plain',()=>{
 assert.equal(admitGpuScene([actor],'fixture','canvaskit').supported,true);
 const markup=html(10);
 assert.match(markup,/data-caption-word-index="2"[^>]*style="[^"]*color:#22c55e[^"]*text-transform:uppercase[^"]*font-size:1.3em/);
 assert.doesNotMatch(markup,/data-caption-word-index="0"[^>]*style="[^"]*#22c55e/);
 assert.notEqual(gpuTextTextureKey(at(10),'font'),gpuTextTextureKey(at(10,{keywordColor:'#ef4444'}),'font'));
});
test('a word colour is more specific than the keyword colour',()=>{
 assert.match(html(10,{wordStyles:[{index:3,color:'#0000ff'}]}),/data-caption-word-index="3"[^>]*style="[^"]*color:#0000ff/);
});
test('keywords stay in their colour while they are said',()=>{
 const spoken={timingMode:'phrase',wordTimings:[{text:'try',start:0,end:.3},{text:'our',start:.3,end:.6},{text:'chai',start:.6,end:1},{text:'latte',start:1,end:1.5}],speakingWordColor:'#ffffff'};
 assert.match(html(22,spoken),/data-caption-word-index="2"[^>]*style="[^"]*color:#22c55e/);
 assert.match(html(12,spoken),/data-caption-word-index="1"[^>]*style="[^"]*color:#ffffff/);
});
test('a caption pop follows its entrance curve on CanvasKit, overshoot included',()=>{
 const punch={animationIn:'pop',animationInDuration:.5,entranceStartScale:.6,entranceOvershoot:.2,keywordWords:[]};
 assert.equal(admitGpuScene([{...actor,props:{...actor.props,...punch}}],'fixture','canvaskit').supported,true);
 const layer=at(0,punch) as unknown as {scale:number};
 assert.ok(Math.abs(layer.scale-.6)<1e-6);
 assert.ok((at(9,punch) as unknown as {scale:number}).scale>1.15);
 assert.equal((at(15,punch) as unknown as {scale:number}).scale,1);
});
test('the word marker draws behind the word being said on CanvasKit and keys the texture',()=>{
 const spoken={keywordWords:[],timingMode:'phrase',wordTimings:[{text:'try',start:0,end:.3},{text:'our',start:.3,end:.6},{text:'chai',start:.6,end:1},{text:'latte',start:1,end:1.5}],wordMarker:'box',wordMarkerColor:'#ff0000'};
 assert.equal(admitGpuScene([{...actor,props:{...actor.props,...spoken}}],'fixture','canvaskit').supported,true);
 const markup=html(12,spoken);
 assert.match(markup,/data-caption-word-index="1"[^>]*style="[^"]*position:relative[^"]*"><span aria-hidden="true" data-caption-word-marker="true" style="[^"]*background-color:rgba\(255, 0, 0, 1\)/);
 assert.equal((markup.match(/data-caption-word-marker/g)??[]).length,1);
 assert.notEqual(gpuTextTextureKey(at(5,spoken),'font'),gpuTextTextureKey(at(12,spoken),'font'));
 const bar=html(24,{...spoken,wordMarker:'bar'});
 assert.equal((bar.match(/data-caption-word-marker/g)??[]).length,5);
});
test('loop motion moves the caption block on CanvasKit without re-rastering, or each word with a re-raster',()=>{
 const block={keywordWords:[],loopMotion:'sway',loopMotionAmount:1,loopMotionSeconds:1};
 assert.equal(admitGpuScene([{...actor,props:{...actor.props,...block}}],'fixture','canvaskit').supported,true);
 const a=at(7,block) as unknown as {rotateZDeg:number};assert.ok(Math.abs(a.rotateZDeg)>3);
 assert.equal(gpuTextTextureKey(at(7,block),'font'),gpuTextTextureKey(at(12,block),'font'));
 assert.doesNotMatch(html(7,block),/rotate\(/);
 const words={...block,loopMotionPerWord:true};
 assert.equal((at(7,words) as unknown as {rotateZDeg:number}).rotateZDeg,0);
 assert.notEqual(gpuTextTextureKey(at(7,words),'font'),gpuTextTextureKey(at(8,words),'font'));
 assert.match(html(7,words),/data-caption-word-index="1"[^>]*style="[^"]*transform:translate\([^)]*\) rotate\(/);
});
test('a word entrance plays letter by letter on CanvasKit, following the speech',()=>{
 const spoken={keywordWords:[],timingMode:'phrase',wordTimings:[{text:'try',start:0,end:.3},{text:'our',start:.3,end:.6},{text:'chai',start:.6,end:1},{text:'latte',start:1,end:1.5}],animationIn:'word_rise',animationInDuration:.2,entranceByLetter:true};
 assert.equal(admitGpuScene([{...actor,props:{...actor.props,...spoken}}],'fixture','canvaskit').supported,true);
 const markup=html(19,spoken);
 const chai=markup.slice(markup.indexOf('data-caption-word-index="2"'),markup.indexOf('data-caption-word-index="3"'));
 const opacities=[...chai.matchAll(/data-caption-letter="true" style="[^"]*opacity:([\d.e-]+)/g)].map(m=>Number(m[1]));
 assert.equal(opacities.length,4);
 assert.ok(opacities[0]>opacities[3],`first letter leads: ${opacities}`);
 assert.notEqual(gpuTextTextureKey(at(19,spoken),'font'),gpuTextTextureKey(at(20,spoken),'font'));
 assert.equal(gpuTextTextureKey(at(5,{...spoken})) ,gpuTextTextureKey(at(5,{...spoken})));
 assert.doesNotMatch(html(19,{...spoken,entranceByLetter:false}),/data-caption-letter/);
});
test('page tilt is turned once on CanvasKit: by the compositor, not again in the raster',()=>{
 const layer=at(10,{pageTilt:'lean',pageTiltDeg:5}) as unknown as {rotateZDeg:number};
 assert.equal(Math.abs(layer.rotateZDeg),5);
 assert.equal(gpuCaptionRasterElement(at(10,{pageTilt:'lean',pageTiltDeg:5}) as never).props?.pageTilt,'none');
});
test('media clips with entrance curve dials stay on CanvasKit',()=>{
 const still={...actor,id:'still',type:'still',source_url:'/media/frame.png',lane_key:'visual_0',props:{animationIn:'pop',animationInDuration:.4,entranceStartScale:.6,entranceOvershoot:.2}} as CompositionElement;
 const admission=admitGpuScene([still],'fixture','canvaskit');
 assert.equal(admission.supported,true,admission.supported?'':admission.reason);
});
