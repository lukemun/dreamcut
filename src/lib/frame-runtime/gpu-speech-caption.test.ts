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
const actor:CompositionElement={id:'speech',type:'caption_text',source_url:null,timeline_start:2,duration:2,lane_key:'captions_0',lane_index:0,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,props:{text:'One two',animationIn:'none',animationOut:'none',styleVariant:'none',timingMode:'active_word',wordTimings:[{text:'One',start:0,end:.8},{text:'two',start:1,end:1.8}],activeWordColor:'#123456',activeWordTextColor:'#ffffff',activeWordPadXEm:.3,activeWordKeepsOutline:true}};
function at(frame:number,props:Record<string,unknown>={}){
 const layer=evaluateGpuScene([{...actor,props:{...actor.props,...props}}],[],frame+60,320,568,'fixture').layers[0];assert.ok(layer.kind==='caption');return layer;
}
const key=(frame:number,props:Record<string,unknown>={})=>gpuTextTextureKey(at(frame,props),'font');
function html(frame:number,props:Record<string,unknown>={}){
 const layer=at(frame,props),session=new FrameSession();
 try{return renderToStaticMarkup(React.createElement(FrameContext.Provider,{value:{frame:layer.rasterFrame,fps:30,width:320,height:568,durationInFrames:60,rendering:true,playing:false,muted:true,volume:0,playbackRate:1,session}},React.createElement(CaptionSequence,{element:gpuCaptionRasterElement(layer),sourceAspectRatio:null,renderScale:1})));}finally{session.dispose();}
}
test('speech captions admit CanvasKit only and preserve active-word shared style',()=>{
 assert.equal(admitGpuScene([actor],'fixture','canvaskit').supported,true);
 assert.equal(admitGpuScene([actor],'fixture','webgpu').supported,false);
 const first=html(5),second=html(35);
 assert.match(first,/data-caption-word-index="0" data-active-word="true"/);
 assert.match(second,/data-caption-word-index="1" data-active-word="true"/);
 assert.match(second,/background-color:#123456/);assert.match(second,/padding-left:0.3em/);
 assert.deepEqual(at(35).speechPhase,{index:1,scaleX:1});
});
test('speech cache retains word boundaries, gaps and backward seeks without rerastering holds',()=>{
 assert.equal(key(5),key(15));assert.notEqual(key(15),key(24));assert.notEqual(key(24),key(30));
 assert.equal(at(24).speechPhase?.index,-1);assert.equal(at(30).speechPhase?.index,1);
 assert.equal(key(35),key(45));assert.equal(key(5),key(5));
 assert.notEqual(key(5),key(5,{activeWordColor:'#abcdef'}));
});
test('single-word squeeze keys include shared animation phase and stable hold identity',()=>{
 const props={timingMode:'single_word'};
 assert.notEqual(key(0,props),key(1,props));assert.equal(key(6,props),key(15,props));
 assert.notEqual(key(15,props),key(23,props));
 assert.equal(at(24,props).speechPhase?.index,-1);
 assert.doesNotMatch(html(24,props),/data-caption-single-word/);
 assert.match(html(35,props),/data-caption-word-index="1"/);
 assert.doesNotMatch(html(35,props),/>One</);
 assert.match(html(0,props),/scaleX\(0.025\)/);
});
test('invalid alignment follows shared phrase fallback; word entrance remains a separate raster phase',()=>{
 const invalid={wordTimings:[{text:'wrong',start:0,end:1}]};
 assert.equal(at(5,invalid).speechPhase,undefined);assert.match(html(5,invalid),/>One two</);
 assert.equal(key(5,invalid),key(35,invalid));
 const entrance={animationIn:'word_rise',animationInDuration:.5};
 assert.notEqual(key(1,entrance),key(5,entrance));
 assert.match(html(5,entrance),/translateY\(/);
});
