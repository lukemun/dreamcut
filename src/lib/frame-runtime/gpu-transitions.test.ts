import test from 'node:test';
import assert from 'node:assert/strict';
import type {TimelineTransition} from '../../components/studio/timeline/types';
import type {CompositionElement} from '../render/composition-adapters';
import {transitionProgress} from '../timeline/transition-frame';
import {gpuTransitionOverlays,gpuTransitionVisual,gpuTransitionCapabilityIssue} from '../gpu-preview/transition-scene';
import {evaluateGpuScene,admitGpuScene} from '../gpu-preview/scene';
import {gpuSceneDraws} from '../gpu-preview/scene-draws';
import {postBlurPlan,postBlurUniforms} from '../gpu-preview/post-blur-pass';

const join:TimelineTransition={id:'join',project_id:'fixture',from_element_id:'a',to_element_id:'b',type:'whip',duration_seconds:.4,
  params:{motion:'smear',direction:'from-right',smear_zoom_percent:0,smear_travel_percent:100,whip_blur_strength:2},
  removed_at:null,removed_reason:null,created_at:'2026-01-01',updated_at:'2026-01-01'};
const video=(id:string,start:number,trim=0):CompositionElement=>({id,type:'video_clip',source_url:'/fixture.mp4',timeline_start:start,duration:2,
  lane_key:'visual_0',lane_index:0,volume:0,trim_start:trim,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,
  props:{source_duration_seconds:5,preview_source_url:'/fixture.mp4',preview_proxy_validation:{contract:'preview-proxy-v1',url:'/fixture.mp4',ok:true,width:320,height:320},
    keyframes:{media_scale:[{t:0,v:1},{t:1,v:2}]}}});
const pair=(transition=join,trim=0)=>[{...video('a',0),transition_out:transition},{...video('b',2,trim),transition_in:transition}];

test('transition clock has quantized endpoints, authored hold and easing, independent of seeking order',()=>{
  const fade={...join,type:'fade' as const,params:{motion_start_progress:.25,bezier:[0,0,1,1] as [number,number,number,number]}};
  assert.equal(transitionProgress(-1,fade,12),0);
  assert.equal(transitionProgress(3,fade,12),0);
  assert.ok(Math.abs(transitionProgress(6,fade,12)!-1/3)<1e-7);
  assert.equal(transitionProgress(12,fade,12),1);
  assert.equal(transitionProgress(20,fade,12),1);
  assert.equal(transitionProgress(6,fade,12),transitionProgress(6,fade,12));
});

test('incoming source handles land on the main clip head without replaying or shifting the edit',()=>{
  const elements=pair(join,.6),before=JSON.stringify(elements);
  assert.equal(gpuTransitionOverlays(elements,47,320,320).length,0);
  const start=gpuTransitionOverlays(elements,48,320,320)[0],last=gpuTransitionOverlays(elements,59,320,320)[0];
  assert.equal(start.sourceTime,.2);
  assert.equal(start.effectTime,0);
  assert.ok(Math.abs(last.sourceTime-17/30)<1e-7);
  assert.equal(last.effectTime,11/30);
  assert.equal(start.element.id,last.element.id);
  assert.notEqual(start.element.id,elements[1].id);
  assert.equal(gpuTransitionOverlays(elements,60,320,320).length,0);
  const main=evaluateGpuScene(elements,[],60,320,320,'fixture').layers[0];
  assert.equal(main.kind,'video');if(main.kind!=='video')throw Error('Missing main picture');
  assert.equal(main.timeUs,616666);
  assert.equal(JSON.stringify(elements),before);
  const fast=elements.map(element=>element.id==='b'?{...element,playback_rate:2,trim_start:1.2}:element);
  assert.equal(gpuTransitionOverlays(fast,48,320,320)[0].sourceTime,.4);
  assert.ok(Math.abs(gpuTransitionOverlays(fast,59,320,320)[0].sourceTime-34/30)<1e-7);
});

test('insufficient handles freeze video head and effect clock; still effects retain the overlap clock',()=>{
  const elements=pair(join,.1);
  const overlay=gpuTransitionOverlays(elements,55,320,320)[0];
  assert.equal(overlay.sourceTime,.1);assert.equal(overlay.effectTime,0);
  const scene=evaluateGpuScene(elements,[],55,320,320,'fixture');
  const incoming=scene.layers.find(layer=>layer.element.id===overlay.element.id)!;
  if(incoming.kind!=='video')throw Error('Missing overlap picture');
  assert.equal(incoming.transform.scale,1);
  const still=elements.map(element=>element.id==='b'?{...element,type:'still',source_url:'/fixture.png'}:element);
  assert.equal(gpuTransitionOverlays(still,55,320,320)[0].sourceTime,0);
  assert.equal(gpuTransitionOverlays(still,55,320,320)[0].effectTime,7/30);
});

test('overlap acquires two complete source dependencies beneath higher picture and text lanes',()=>{
  const elements=[...pair(),{...video('foreground',0),lane_key:'visual_1'},
    {...video('caption',0),type:'caption_text',source_url:null,lane_key:'captions_0',props:{text:'Hello'}}];
  const scene=evaluateGpuScene(elements,[],54,320,320,'fixture');
  assert.deepEqual(scene.layers.map(layer=>layer.element.id),['a','@gpu-transition:join','foreground','caption']);
  const pictures=scene.layers.filter(layer=>layer.kind==='video');
  const frames=new Map(pictures.map(layer=>[layer.element.id,{sourceKey:layer.source.key,timestampUs:layer.timeUs,durationUs:33334,bytes:409600,
    value:{displayWidth:320,displayHeight:320} as VideoFrame,release(){}}]));
  assert.equal(gpuSceneDraws(scene,frames,()=>({width:320,height:320}) as OffscreenCanvas).length,4);
  frames.delete('@gpu-transition:join');assert.throws(()=>gpuSceneDraws(scene,frames,()=>undefined),/exact source frame/);
});

test('smear geometry and pulse distinguish incoming opacity, axis and outgoing full actor',()=>{
  const elements=pair();
  const incoming=gpuTransitionVisual(elements[1],6,12,320,640,'in');
  assert.equal(incoming.opacity,.5);assert.equal(incoming.pose!.translateX,160);
  assert.ok(Math.abs(incoming.postBlur!.x-320*320/1080)<1e-7);assert.equal(incoming.postBlur!.y,2);
  const outgoing=gpuTransitionVisual(elements[0],54,60,320,640,'out');
  assert.equal(outgoing.opacity,1);assert.equal(outgoing.pose!.translateX,-160);
  const vertical=gpuTransitionVisual({...elements[1],transition_in:{...join,params:{...join.params,direction:'from-bottom'}}},6,12,320,640,'in');
  assert.equal(vertical.pose!.translateY,320);assert.equal(vertical.postBlur!.x,2);
  assert.equal(gpuTransitionVisual(elements[0],0,60,320,640,'out').postBlur,undefined);
  assert.equal(admitGpuScene(elements,'fixture').supported,true);
});

test('transition admission enables verified variants and keeps failed or unverified variants explicit',()=>{
  assert.equal(gpuTransitionCapabilityIssue(join),null);
  assert.equal(gpuTransitionCapabilityIssue({...join,type:'fade'}),null);
  for(const params of [{...join.params,direction:'from-bottom' as const},
    {...join.params,direction:'from-left' as const},{...join.params,smear_zoom_percent:35},
    {...join.params,smear_travel_percent:12},{...join.params,whip_blur_strength:3},
    {...join.params,motion:'in-place' as const}]){
    const changed={...join,params};assert.ok(gpuTransitionCapabilityIssue(changed));
    assert.equal(admitGpuScene(pair(changed),'fixture').supported,false);
  }
  for(const type of ['slide','wipe','cube','page_turn'] as const)assert.ok(gpuTransitionCapabilityIssue({...join,type}));
});

test('wide post-filter reduction preserves the original source texel origin and bounded convolution',()=>{
  const plan=postBlurPlan(320,640,95,2);
  const input=plan.reductions.at(-1)!;
  assert.equal(input.width,14);assert.equal(input.height,640);
  assert.ok(Math.abs(input.inverseX-1.484375)<1e-7);
  assert.ok(Math.abs(input.sampleX+.390625)<1e-7);
  assert.ok(Math.abs(plan.extentWidth-2*plan.sourcePadX-320)<1e-7);
  assert.ok(plan.sigmaX<=4&&plan.sigmaY<=4);
  assert.equal(plan.width,input.width+2*plan.padX);
  assert.equal(plan.height,input.height+2*plan.padY);
  assert.ok(plan.reductions.every((size,index)=>size.width>0&&size.height>0&&size.width>=(plan.reductions[index+1]?.width??0)));
  const identity=postBlurPlan(320,640,0,0);
  assert.deepEqual(identity.reductions,[]);
  assert.equal(identity.extentWidth,320);assert.equal(identity.extentHeight,640);
  assert.throws(()=>postBlurPlan(320,640,NaN,2),/geometry/);
});

test('paired Gaussian taps preserve normalized energy and centered sampling for odd/even radii',()=>{
  for(const sigma of [0,.2,.7,2,3.85,4]){
    const packed=postBlurUniforms(sigma,false);
    assert.equal(packed.length,60);assert.ok(packed.every(Number.isFinite));
    const count=packed[2];let energy=0,center=0;
    for(let i=0;i<count;i++){const offset=packed[4+2*i],weight=packed[5+2*i];energy+=weight;center+=weight*offset;}
    assert.ok(Math.abs(energy-1)<1e-6);assert.ok(Math.abs(center)<1e-6);
    assert.equal(postBlurUniforms(sigma,true)[1],1);
  }
  assert.throws(()=>postBlurUniforms(5,false),/sigma/);
});

test('travelling slides move both cards in opposite directions on the shared clock',()=>{
 for(const [direction,x,y] of [['from-right',160,0],['from-left',-160,0],['from-top',0,-90],['from-bottom',0,90]] as const){
  const transition={...join,type:'slide' as const,params:{direction}};
  const [a,b]=pair(transition);
  const incoming=gpuTransitionVisual(b,6,60,320,180,'in');
  const outgoing=gpuTransitionVisual(a,54,60,320,180,'out');
  assert.equal(incoming.pose?.translateX,x);assert.equal(incoming.pose?.translateY,y);
  assert.equal(outgoing.pose?.translateX,-x||0);assert.equal(outgoing.pose?.translateY,-y||0);
  assert.equal(incoming.opacity,1);assert.equal(outgoing.opacity,1);
  assert.equal(incoming.postBlur,undefined);assert.equal(outgoing.postBlur,undefined);
 }
});
test('in-place slide leaves the outgoing card fixed while incoming opacity and scale settle',()=>{
 const transition={...join,type:'slide' as const,params:{motion:'in-place' as const,direction:'from-right' as const}};
 const [a,b]=pair(transition);
 const incoming=gpuTransitionVisual(b,6,60,320,180,'in'),outgoing=gpuTransitionVisual(a,54,60,320,180,'out');
 assert.equal(incoming.opacity,.5);assert.equal(incoming.pose?.scale,.9924999999999999);
 assert.equal(incoming.pose?.translateX,9.6);assert.equal(outgoing.pose?.translateX,0);
 assert.equal(outgoing.opacity,1);assert.equal(outgoing.postBlur,undefined);
 const short=gpuTransitionVisual({...b,props:{...b.props,transition_travel_percent:35},transition_in:{...transition,params:{direction:'from-right'}}},6,60,320,180,'in');
 assert.equal(short.pose?.translateX,56);
});


test('ordinary slide admission covers verified directions and excludes failing variants',()=>{
 for(const direction of ['from-right','from-left','from-bottom'] as const){
  const transition={...join,type:'slide' as const,params:{motion:'travel' as const,direction}};
  assert.equal(gpuTransitionCapabilityIssue(transition),null);
  assert.equal(admitGpuScene(pair(transition),'fixture').supported,true);
  assert.equal(gpuTransitionCapabilityIssue({...transition,params:{...transition.params,whip_blur_strength:0}}),null);
 }
 for(const params of [{direction:'from-top' as const},{motion:'in-place' as const},{motion:'smear' as const},{whip_blur_strength:.75}]){
  const transition={...join,type:'slide' as const,params};
  assert.ok(gpuTransitionCapabilityIssue(transition));
  assert.equal(admitGpuScene(pair(transition),'fixture').supported,false);
 }
});

test('wipe and accent packets preserve held head source, lane order, and independent wash opacity',()=>{
 for(const type of ['wipe','film_burn','camera_flash','blackout'] as const){
  const transition={...join,type,params:{direction:'from-right' as const,accent_strength:.6,accent_hold:.2}};
  const elements=[...pair(transition,.6),{...video('foreground',0),lane_key:'visual_1'}];
  for(const frame of [48,54,59,48]){
   const scene=evaluateGpuScene(elements,[],frame,320,180,'fixture');
   const pictures=scene.layers.filter(layer=>layer.kind==='video');
   assert.deepEqual(pictures.map(layer=>layer.element.id),['a','@gpu-transition:join','foreground']);
   assert.equal(pictures[1].timeUs,616666);
   const frames=new Map(pictures.map(layer=>[layer.element.id,{sourceKey:layer.source.key,timestampUs:layer.timeUs,durationUs:33334,bytes:409600,value:{displayWidth:320,displayHeight:180} as VideoFrame,release(){}}]));
   const draws=gpuSceneDraws(scene,frames,()=>undefined),incoming=draws[1];
   assert.equal(draws[0].boundaryWash,undefined);assert.equal(draws[2].boundaryWash,undefined);
   if(type==='wipe'){assert.ok(incoming.boundaryClip);assert.equal(incoming.boundaryWash,undefined);}
   else{assert.ok(incoming.boundaryWash);if(frame===48){assert.equal(incoming.groupOpacity,0);assert.equal(incoming.boundaryWash.opacity,0);}if(frame===54){assert.equal(incoming.groupOpacity,1);assert.equal(incoming.boundaryWash.opacity,.6);}}
  }
  assert.equal(admitGpuScene(elements,'fixture').supported,false);
 }
});

test('cube packet retains source head and projects whole actor independently of source crop',()=>{
 const transition={...join,type:'cube' as const,params:{direction:'from-right' as const}},elements=pair(transition,.6);
 const scene=evaluateGpuScene(elements,[],54,320,180,'fixture'),pictures=scene.layers.filter(layer=>layer.kind==='video');
 assert.equal(pictures[1].timeUs,616666);
 const frames=new Map(pictures.map(layer=>[layer.element.id,{sourceKey:layer.source.key,timestampUs:layer.timeUs,durationUs:33334,bytes:409600,value:{displayWidth:160,displayHeight:160} as VideoFrame,release(){}}]));
 const draws=gpuSceneDraws(scene,frames,()=>undefined);
 assert.ok(draws.every(draw=>draw.boundaryProjective?.quad.length===4));
 assert.notDeepEqual(draws[0].boundaryProjective?.quad,draws[1].boundaryProjective?.quad);
 assert.equal(draws[1].group?.scale,1);assert.equal(draws[0].group?.scale,1);
 assert.equal(admitGpuScene(elements,'fixture').supported,false);
});

test('page turn overlays hold distinct outgoing tail above incoming head and below higher lanes',()=>{
 const transition={...join,type:'page_turn' as const,params:{direction:'from-right' as const}},elements=[...pair(transition,.6),{...video('higher',0),lane_key:'visual_1'}];
 const originals=JSON.stringify(elements);
 for(const frame of [48,54,59,48]){
  const scene=evaluateGpuScene(elements,[],frame,320,180,'fixture'),pictures=scene.layers.filter(layer=>layer.kind==='video');
  assert.deepEqual(pictures.map(layer=>layer.element.id),['a','@gpu-transition:join','@gpu-page-tail:join','higher']);
  assert.equal(pictures[1].timeUs,616666);assert.equal(pictures[2].timeUs,1983332);assert.equal(pictures[2].effectTime,0);
  assert.ok(pictures[2].transition?.boundaryPageTurn);assert.equal(pictures[0].transition?.boundaryPageTurn,undefined);
  assert.equal(pictures[2].transform.scale,1);
 }
 assert.equal(JSON.stringify(elements),originals);
 assert.equal(gpuTransitionOverlays(elements,60,320,180).length,0);
});
