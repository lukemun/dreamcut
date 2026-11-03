import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {FrameContext,FrameSession} from './index';
import {CaptionSequence} from '../remotion/TimelineComposition';
import {admitGpuScene,evaluateGpuScene,gpuSceneCapabilityIssues,type GpuCaptionLayer} from '../gpu-preview/scene';
import {gpuTextTextureKey} from '../gpu-preview/scene-draws';
import {gpuCaptionRasterElement} from '../gpu-preview/caption-raster-element';
import {captionSafeAreaVisuals,resolveCaptionSourceAspectRatio} from '../timeline/caption-coordinate-space';
import {projectCompoundPreviews} from '../timeline/compound-preview';
import type {CompositionElement} from '../render/composition-adapters';

const W=1920,H=1080;
const base={source_url:null,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0} as const;
const still=(id:string,start:number,duration:number,lane:string,props:Record<string,unknown>={}):CompositionElement=>
 ({...base,id,type:'still',source_url:`/${id}.png`,timeline_start:start,duration,lane_key:lane,lane_index:Number(lane.split('_')[1]),props});
const caption=(props:Record<string,unknown>={},start=1):CompositionElement=>
 ({...base,id:'caption',type:'caption_text',timeline_start:start,duration:2,lane_key:'captions_0',lane_index:0,
  props:{text:'Coordinate space',animationIn:'none',animationOut:'none',styleVariant:'none',offsetX:.1,...props}});

/** Standard: TimelineComposition's projection and selection, per caption. */
function standardAspect(elements:CompositionElement[],target:CompositionElement){
 return resolveCaptionSourceAspectRatio(target,captionSafeAreaVisuals(projectCompoundPreviews(elements,true)));
}
/** Browser GPU: the admitted scene's caption layer at the caption's first frame. */
function gpuLayer(elements:CompositionElement[]):GpuCaptionLayer{
 const admission=admitGpuScene(elements,'fixture','canvaskit');
 assert.equal(admission.supported,true,admission.supported?'':admission.reason);
 const layer=evaluateGpuScene(admission.supported?admission.elements:[],[],45,W,H,'fixture').layers.find(item=>item.kind==='caption');
 assert.ok(layer&&layer.kind==='caption');return layer;
}
function markup(element:CompositionElement,sourceAspectRatio:number|null){
 const session=new FrameSession();
 try{return renderToStaticMarkup(React.createElement(FrameContext.Provider,{value:{frame:15,fps:30,width:W,height:H,durationInFrames:60,rendering:true,playing:false,muted:true,volume:0,playbackRate:1,session}},
  React.createElement(CaptionSequence,{element,sourceAspectRatio,renderScale:1})));}
 finally{session.dispose();}
}

const scenarios:Array<{name:string;elements:CompositionElement[];expected:number|null}>=[
 {name:'(a) vertical clip in a 16:9 frame',expected:1080/1920,elements:[
  still('wide',0,1,'visual_0',{source_width:1920,source_height:1080}),
  still('vertical',1,3,'visual_0',{source_width:1080,source_height:1920}),
  caption()]},
 {name:'(b) caption carries its own source size',expected:1080/1350,elements:[
  still('wide',0,4,'visual_0',{source_width:1920,source_height:1080}),
  caption({source_width:1080,source_height:1350})]},
 {name:'(c) no source size anywhere',expected:null,elements:[still('plain',0,4,'visual_0'),caption()]},
];

for(const scenario of scenarios)test(`Standard and GPU derive the same caption coordinate space: ${scenario.name}`,()=>{
 const target=scenario.elements.find(element=>element.type==='caption_text')!;
 const standard=standardAspect(scenario.elements,target);
 const layer=gpuLayer(scenario.elements);
 assert.equal(standard,scenario.expected);
 assert.equal(layer.sourceAspectRatio,standard);
 // The GPU raster renders the shared CaptionSequence with the carried aspect, so the
 // static layout (relative offset and wrap width inside the content rect) is identical.
 const standardHtml=markup(target,standard),gpuHtml=markup(gpuCaptionRasterElement(layer),layer.sourceAspectRatio??null);
 const offset=(html:string)=>html.match(/translate\(([-0-9.e]+)px, ([-0-9.e]+)px\)/)?.slice(1).map(Number);
 assert.deepEqual(offset(gpuHtml),offset(standardHtml));
 assert.ok(Math.abs(offset(standardHtml)![0]-.1*W*(scenario.expected==null?1:scenario.expected/(W/H)))<1e-6);
});

test('caption coordinate space changes GPU glyph identity only when the aspect changes',()=>{
 const [vertical,own,none]=scenarios.map(item=>gpuTextTextureKey(gpuLayer(item.elements),'font'));
 assert.notEqual(vertical,none);assert.notEqual(own,none);assert.notEqual(vertical,own);
 assert.equal(gpuTextTextureKey(gpuLayer(scenarios[2].elements),'font'),none);
});

test('source size is admitted on captions and media for both engines; clip-to-media-bounds is CanvasKit-only',()=>{
 const elements=scenarios[0].elements;
 for(const engine of ['webgpu','canvaskit'] as const)
  assert.deepEqual(gpuSceneCapabilityIssues(elements,'fixture',engine).filter(issue=>/source_(width|height)/.test(issue.capability)),[]);
 const clipped=still('clipped',0,1,'visual_0',{source_width:1080,source_height:1920,transition_clip_to_media_bounds:true});
 assert.ok(!gpuSceneCapabilityIssues([clipped],'fixture','canvaskit').some(issue=>issue.capability==='property:transition_clip_to_media_bounds'));
 assert.ok(gpuSceneCapabilityIssues([clipped],'fixture','webgpu').some(issue=>issue.capability==='property:transition_clip_to_media_bounds'));
});

test('Standard reads caption coordinate space from the shared owner',()=>{
 const source=readFileSync(new URL('../remotion/TimelineComposition.tsx',import.meta.url),'utf8');
 assert.match(source,/resolveCaptionSourceAspectRatio\(el, visualElementsForCaptionSafeArea\)/);
 assert.match(source,/captionSafeAreaVisuals\(projectedElements\)/);
 assert.doesNotMatch(source,/function (readSourceAspectRatio|findVisualForCaption)\b/);
});
