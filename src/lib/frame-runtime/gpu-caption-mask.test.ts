import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {HandwritingImageFill} from '../remotion/HandwritingImageFill';
import {FrameContext,FrameSession} from './index';

test('handwriting fill SVG serialization survives nested static caption rendering',()=>{
 const session=new FrameSession();
 try{
  const render=(reveal:number)=>renderToStaticMarkup(React.createElement(FrameContext.Provider,{value:{frame:12,fps:30,width:320,height:320,durationInFrames:72,rendering:true,playing:false,muted:true,volume:0,playbackRate:1,session}},React.createElement(HandwritingImageFill,{label:'Mask',width:100,height:40,displayWidth:200,displayHeight:80,fill:{urls:['/image.png'],localSeconds:.4,secondsPerImage:1,crossfadeSeconds:.2,scale:1,panPercent:0,revealProgress:reveal},children:React.createElement('path',{d:'M0 0H100V40H0Z',fill:'white'})})));
  const partial=render(.5),complete=render(1);
  assert.match(partial,/data-handwriting-image-fill/);
  assert.ok(partial.includes(encodeURIComponent('width="50"')),'Half reveal must clip to half of the original SVG plane');
  assert.ok(!complete.includes('ink-reveal'),'Completed reveal must remove the temporary mask clip');
  assert.equal(render(.5),partial,'Backward/repeated raster requests must retain the same mask');
 }finally{session.dispose();}
});

test('GPU mask rendering keeps shared glyph clipping without starting a video resource',async()=>{
 const {HandwritingFillMaskContext}=await import('../remotion/HandwritingImageFill');
 const session=new FrameSession();
 try{
  const html=renderToStaticMarkup(React.createElement(FrameContext.Provider,{value:{frame:12,fps:30,width:320,height:320,durationInFrames:72,rendering:true,playing:false,muted:true,volume:0,playbackRate:1,session}},
   React.createElement(HandwritingFillMaskContext.Provider,{value:true},React.createElement(HandwritingImageFill,{label:'Video mask',width:100,height:40,displayWidth:200,displayHeight:80,fill:{videoUrl:'/export-original.mp4',previewVideoUrl:'/preview.mp4',urls:[],localSeconds:.4,secondsPerImage:1,crossfadeSeconds:0,scale:1,panPercent:0,revealProgress:.5},children:React.createElement('path',{d:'M0 0H100V40H0Z',fill:'white'})}))));
  assert.match(html,/data-video-fill-mask/);assert.ok(html.includes(encodeURIComponent('width="50"')));
  assert.doesNotMatch(html,/<video|export-original|preview\.mp4/);
 }finally{session.dispose();}
});
