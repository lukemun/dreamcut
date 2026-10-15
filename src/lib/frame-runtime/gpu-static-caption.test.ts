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

const actor:CompositionElement={id:'caption',type:'caption_text',source_url:null,timeline_start:0,duration:3,lane_key:'captions_0',lane_index:0,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,props:{text:'Mixed Case',animationIn:'none',animationOut:'none',styleVariant:'none'}};
function layer(props:Record<string,unknown>,frame=30){
 const result=evaluateGpuScene([{...actor,props:{...actor.props,...props}}],[],frame,320,568,'fixture').layers[0];
 assert.ok(result.kind==='caption');return result;
}
function markup(props:Record<string,unknown>){
 const session=new FrameSession();
 try{return renderToStaticMarkup(React.createElement(FrameContext.Provider,{value:{frame:30,fps:30,width:320,height:568,durationInFrames:90,rendering:true,playing:false,muted:true,volume:0,playbackRate:1,session}},React.createElement(CaptionSequence,{element:gpuCaptionRasterElement(layer(props)),sourceAspectRatio:null,renderScale:1})));}
 finally{session.dispose();}
}
test('CanvasKit static caption controls admit shared raster layout without broadening WebGPU',()=>{
 for(const props of [{offsetX:.1},{offsetY:-.1},{textScaleX:1.2},{textScaleY:.8},{textCase:'upper'},{groupLayout:{kind:'paragraph_panel',row:1,rows:3}}]){
  const element={...actor,props:{...actor.props,...props}};
  assert.equal(admitGpuScene([element],'fixture','canvaskit').supported,true);
  assert.equal(admitGpuScene([element],'fixture','webgpu').supported,false);
 }
 assert.equal(admitGpuScene([{...actor,props:{...actor.props,surfaceMode:'wall',surfaceBlendMode:'screen'}}],'fixture','canvaskit').supported,false);
});
test('static caption layout survives raster neutralization while compositor position stays separate',()=>{
 const current=layer({offsetX:.1,offsetY:-.1,textScaleX:1.2,textScaleY:.8,media_offset_x:.2,media_offset_y:.3});
 const raster=gpuCaptionRasterElement(current);
 assert.equal(raster.props.offsetX,.1);assert.equal(raster.props.offsetY,-.1);
 assert.equal(raster.props.textScaleX,1.2);assert.equal(raster.props.textScaleY,.8);
 assert.equal(raster.props.media_offset_x,0);assert.equal(raster.props.media_offset_y,0);
 assert.deepEqual(current.translation,{x:32,y:85.2});assert.equal(current.scale,1);
 const html=markup({offsetX:.1,offsetY:-.1,textScaleX:1.2,textScaleY:.8});
 assert.match(html,/translate\(32px, -56\.800000000000004px\)/);
 assert.match(html,/scale\(1\.2, 0\.8\)/);
 assert.match(markup({absX:.2,absY:.3,offsetX:.1,offsetY:-.1}),/translate\(0px, 0px\)/,'Absolute placement suppresses static relative offset just as Standard does');
});
test('paragraph rows use shared layout and legacy textCase preserves literal text',()=>{
 for(const [row,top]of [[0,'16%'],[1,'37.75%'],[2,'59.5%']]as const){
  const html=markup({groupLayout:{kind:'paragraph_panel',packing:'reels_safe',row,rows:3},textCase:'upper'});
  assert.match(html,/left:7\.5%/);assert.ok(Math.abs(Number(html.match(/top:([0-9.]+)%/)?.[1])-parseFloat(top))<1e-9,html);
  assert.match(html,/Mixed Case/);assert.doesNotMatch(html,/MIXED CASE/);
 }
 assert.equal(layer({textCase:'upper'}).text.textCase,'source');
 assert.equal(layer({groupLayout:{kind:'paragraph_panel',row:4,rows:3}}).text.groupLayout,null);
});
test('static caption edits invalidate glyphs but unchanged repeated seeks reuse them',()=>{
 const key=(props:Record<string,unknown>,frame=30)=>gpuTextTextureKey(layer(props,frame),'font');
 const original=key({});
 for(const props of [{offsetX:.1},{offsetY:.1},{textScaleX:1.2},{textScaleY:.8},{groupLayout:{kind:'paragraph_panel',row:1,rows:3}}]){
  assert.notEqual(key(props),original);assert.equal(key(props,60),key(props,15));
 }
 assert.equal(key({textCase:'upper'}),original,'Ignored legacy case must not change glyph identity');
});
