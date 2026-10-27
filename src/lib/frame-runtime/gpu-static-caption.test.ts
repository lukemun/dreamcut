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
function markup(props:Record<string,unknown>,frame=30){
 const session=new FrameSession();
 try{return renderToStaticMarkup(React.createElement(FrameContext.Provider,{value:{frame,fps:30,width:320,height:568,durationInFrames:90,rendering:true,playing:false,muted:true,volume:0,playbackRate:1,session}},React.createElement(CaptionSequence,{element:gpuCaptionRasterElement(layer(props,frame)),sourceAspectRatio:null,renderScale:1})));}
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

test('type-on preserves word colour and highlight through the shared GPU raster',()=>{
 const props={animationIn:'type_on',animationInDuration:1,wordStyles:[{index:1,color:'#ff0000',background:'#00ff00'}]};
 for(const frame of [30,0,15,30]){
  const html=markup(props,frame);
  assert.match(html,/data-caption-word-index="1"/);
  assert.match(html,/color:#ff0000/);
  assert.match(html,/background-color:#00ff00/);
  if(frame===0)assert.match(html,/visibility:hidden/);
 }
 assert.equal(markup(props,30),markup(props,30),'repeated settled seeks are deterministic');
});


test('single-word captions retain word styling in the shared GPU raster',()=>{
 const props={timingMode:'single_word',wordTimings:[{text:'Mixed',start:0,end:1.5},{text:'Case',start:1.5,end:3}],wordStyles:[{index:1,color:'#ff0000',background:'#00ff00'}]};
 const first=markup(props,15), second=markup(props,60);
 assert.doesNotMatch(first,/background-color:#00ff00/);
 assert.match(second,/color:#ff0000/);
 assert.match(second,/background-color:#00ff00/);
 assert.equal(second,markup(props,60));
});
