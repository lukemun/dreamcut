import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCaptionProps} from '../timeline/captions';
import {gpuCaptionFillPlan} from '../gpu-preview/caption-fill';
import {gpuTextTextureKey} from '../gpu-preview/scene-draws';
import {evaluateGpuScene,admitGpuScene} from '../gpu-preview/scene';
import type {CompositionElement} from '../render/composition-adapters';
const text=resolveCaptionProps({text:'Fill',styleVariant:'image_fill',mediaFillUrls:['/one.png','/two.png'],mediaFillSecondsPerImage:1,mediaFillCrossfadeSeconds:.25});

test('filled-text dependency plan retains the different ordinary and handwriting blend semantics',()=>{
 const ordinary=gpuCaptionFillPlan(text,27,30,0)!;
 assert.equal(ordinary.kind,'images');if(ordinary.kind!=='images')throw Error('Missing image plan');
 assert.equal(ordinary.mode,'background');assert.deepEqual(ordinary.layers.map(l=>l.url),['/one.png','/two.png']);
 assert.ok(Math.abs(ordinary.layers[0].opacity-.4)<1e-12);assert.ok(Math.abs(ordinary.layers[1].opacity-.6)<1e-12);
 const writing=gpuCaptionFillPlan({...text,animationIn:'handwriting'},27,30,0)!;
 assert.equal(writing.kind,'images');if(writing.kind!=='images')throw Error('Missing handwriting plan');
 assert.equal(writing.layers[0].opacity,1);assert.equal(writing.layers[1].opacity,ordinary.layers[1].opacity);
 assert.equal(gpuCaptionFillPlan(text,30,30,0)!.kind,'images');
 assert.equal(gpuCaptionFillPlan({...text,styleVariant:'plain'},0,30,0),undefined);
});

test('video-filled handwriting uses prepared preview source and the scene source clock',()=>{
 const video={...text,animationIn:'handwriting' as const,mediaFillVideoUrl:'/original.mp4',mediaFillVideoPreviewUrl:'/proxy.mp4',mediaFillVideoPlaybackRate:1.5,mediaFillScene:{startSeconds:2,x:0,y:0,width:1,height:1}};
 const plan=gpuCaptionFillPlan(video,12,30,3.013)!;
 assert.equal(plan.kind,'video');if(plan.kind!=='video')throw Error('Missing video plan');
 assert.equal(plan.url,'/proxy.mp4');assert.equal(plan.sourceTimeSeconds,64/30);
 const missing=gpuCaptionFillPlan({...video,mediaFillVideoPreviewUrl:''},12,30,3.013)!;
 assert.equal(missing.kind,'video');assert.equal(missing.kind==='video'&&missing.url,'','No fallback to export original');
 assert.equal(gpuCaptionFillPlan({...video,animationIn:'none'},12,30,3.013)!.kind,'images','Ordinary text preserves its existing image-only renderer');
});

test('image fill stays phase-keyed after handwriting finishes while video fill remains unadmitted',()=>{
 const element:CompositionElement={id:'filled',type:'caption_text',source_url:null,timeline_start:0,duration:3,lane_key:'captions_0',lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0,props:{...text,animationIn:'handwriting',animationInDuration:.1}};
 assert.equal(admitGpuScene([element],'fixture').supported,true);
 assert.equal(admitGpuScene([{...element,props:{...element.props,mediaFillUrls:['/animated.gif']}}],'fixture').supported,false);
 assert.equal(admitGpuScene([{...element,props:{...element.props,mediaFillVideoUrl:'/original.mp4',mediaFillVideoPreviewUrl:'/proxy.mp4'}}],'fixture').supported,false);
 const at=(frame:number)=>{const layer=evaluateGpuScene([element],[],frame,320,320,'fixture').layers[0];if(layer.kind!=='caption')throw Error('Missing caption');return layer;};
 assert.equal(at(15).handwritingProgress,1);
 assert.notEqual(gpuTextTextureKey(at(15),'font'),gpuTextTextureKey(at(27),'font'));
 assert.equal(gpuTextTextureKey(at(15),'font'),gpuTextTextureKey(at(15),'font'));
});


test('stationary single-image handwriting reuses fill pixels after reveal completion',()=>{
 const stationary={...text,animationIn:'handwriting' as const,mediaFillUrls:['/one.png'],mediaFillScale:1,mediaFillPanPercent:20};
 assert.deepEqual(gpuCaptionFillPlan(stationary,10,30,0),gpuCaptionFillPlan(stationary,27,30,0));
 const moving={...stationary,mediaFillScale:1.3};
 assert.notDeepEqual(gpuCaptionFillPlan(moving,10,30,0),gpuCaptionFillPlan(moving,27,30,0));
});

test('video clock advances independently from a completed reusable glyph mask',()=>{
 const element:CompositionElement={id:'video-fill',type:'caption_text',source_url:null,timeline_start:0,duration:3,lane_key:'captions_0',lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0,props:{text:'VIDEO',styleVariant:'image_fill',animationIn:'handwriting',animationInDuration:.1,mediaFillVideoUrl:'/original.mp4',mediaFillVideoPreviewUrl:'/proxy.mp4',mediaFillScene:{startSeconds:0,x:0,y:0,width:1,height:1}}};
 const a=evaluateGpuScene([element],[],15,320,320,'fixture').layers[0],b=evaluateGpuScene([element],[],27,320,320,'fixture').layers[0];
 if(a.kind!=='caption'||b.kind!=='caption'||a.fill?.kind!=='video'||b.fill?.kind!=='video')throw Error('Missing video captions');
 assert.notEqual(a.fill.sourceTimeSeconds,b.fill.sourceTimeSeconds);
 assert.equal(gpuTextTextureKey(a,'font'),gpuTextTextureKey(b,'font'));
 assert.notEqual(gpuTextTextureKey(a,'font'),gpuTextTextureKey({...a,handwritingProgress:.5},'font'));
});

test('video-fill draws use measured per-line placement rather than an assumed global rectangle',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const {setGpuTextBounds,setGpuTextFillRegions}=await import('../gpu-preview/text-bounds');
 const element:CompositionElement={id:'video-fill-layout',type:'caption_text',source_url:null,timeline_start:0,duration:3,lane_key:'captions_0',lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0,props:{text:'ONE\nTWO',styleVariant:'image_fill',animationIn:'handwriting',animationInDuration:.1,mediaFillVideoUrl:'/original.mp4',mediaFillVideoPreviewUrl:'/proxy.mp4',mediaFillScene:{startSeconds:0,x:0,y:0,width:1,height:1}}};
 const scene=evaluateGpuScene([element],[],15,320,320,'fixture');
 const mask={width:100,height:120} as OffscreenCanvas;
 setGpuTextBounds(mask,{x:10,y:20,width:100,height:120});
 setGpuTextFillRegions(mask,[{x:10,y:20,width:100,height:50,videoRect:{x:0,y:5,width:320,height:320}},{x:10,y:90,width:100,height:50,videoRect:{x:0,y:75,width:320,height:320}}]);
 const source={displayWidth:320,displayHeight:320} as VideoFrame;
 const decoded={sourceKey:'verified',timestampUs:500000,durationUs:33333,bytes:4,value:source,release(){}};
 const draws=gpuSceneDraws(scene,new Map([[element.id,decoded]]),()=>mask);
 assert.equal(draws.length,2);
 assert.deepEqual(draws.map(draw=>draw.clip),[[10,20,110,70],[10,90,110,140]]);
 assert.deepEqual(draws.map(draw=>draw.captionMask?.mapping[3]),[-15/120,55/120]);
 assert.ok(draws.every(draw=>draw.frame===source&&draw.captionMask?.canvas===mask));
 assert.throws(()=>gpuSceneDraws(scene,new Map([[element.id,{...decoded,timestampUs:600000}]]),()=>mask),/exact video frame/);
});

test('simultaneous captions share Standard paint order regardless of input order',()=>{
 const element:CompositionElement={id:'z-front',type:'caption_text',source_url:null,timeline_start:0,duration:3,lane_key:'captions_0',lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0,props:{text:'FRONT'}};
 const back={...element,id:'a-back',props:{text:'BACK'}};
 for(const items of [[element,back],[back,element]])assert.deepEqual(evaluateGpuScene(items,[],15,320,320,'fixture').layers.map(layer=>layer.element.id),['a-back','z-front']);
});
