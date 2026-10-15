import test from 'node:test';
import assert from 'node:assert/strict';
import type {TimelineTransition} from '../../components/studio/timeline/types';
import {gpuBoundaryVisual,gpuCubeProjection,gpuWipeClip} from '../gpu-preview/boundary-visual';
import {pageTurnVisualPlan} from '../timeline/page-turn-plan';
import {accentTransitionFrame} from '../timeline/accent-transitions';
import {gpuTransitionCapabilityIssue,gpuTransitionVisual} from '../gpu-preview/transition-scene';
const transition=(type:TimelineTransition['type'],params:TimelineTransition['params']=null)=>({id:'transition',project_id:'fixture',from_element_id:'a',to_element_id:'b',type,duration_seconds:1,params,removed_at:null,removed_reason:null,created_at:'',updated_at:''} as TimelineTransition);

test('wipe follows Standard directional inset semantics and clamps endpoints',()=>{
 assert.deepEqual(gpuWipeClip(.25,'from-left',320,180),[0,0,80,180]);
 assert.deepEqual(gpuWipeClip(.25,'from-right',320,180),[240,0,320,180]);
 assert.deepEqual(gpuWipeClip(.25,'from-top',320,180),[0,135,320,180]);
 assert.deepEqual(gpuWipeClip(.25,'from-bottom',320,180),[0,0,320,45]);
 assert.deepEqual(gpuWipeClip(2,'from-right',320,180),[0,0,320,180]);
 assert.equal(gpuBoundaryVisual(transition('wipe'),.5,'out',320,180,'still')!.clip,undefined);
});

test('cube projects the complete actor with identity endpoints and edge-on opposing faces',()=>{
 for(const direction of ['from-left','from-right','from-top','from-bottom'] as const){
  const start=gpuCubeProjection(0,'out',direction,320,180),end=gpuCubeProjection(1,'in',direction,320,180);
  assert.deepEqual(start.quad,[[0,0],[320,0],[320,180],[0,180]]);assert.deepEqual(end.quad,start.quad);
  const midway=gpuCubeProjection(.5,'in',direction,320,180);assert.notDeepEqual(midway.quad,start.quad);
  assert.equal(midway.backfaceVisible,false);assert.ok(midway.quad.flat().every(Number.isFinite));
  assert.deepEqual(midway,gpuCubeProjection(.5,'in',direction,320,180));
 }
});

test('accent transitions retain authored strength/hold and Standard switch timing',()=>{
 for(const type of ['film_burn','camera_flash','blackout'] as const)for(const progress of [0,.2,.499,.5,.8,1]){
  const t=transition(type,{accent_strength:.7,accent_hold:.4}),expected=accentTransitionFrame(type,progress,t.params);
  const actual=gpuBoundaryVisual(t,progress,'in',320,180,'video_clip')!;
  assert.equal(actual.opacity,expected.incomingOpacity);
  assert.deepEqual(actual.wash,{opacity:expected.washOpacity,background:expected.background});
 }
});

test('page-turn extraction preserves neutral segmented geometry and rigid video branch',()=>{
 const start=pageTurnVisualPlan(0,{direction:'from-right'},'still',360,640);
 assert.equal(start.positionedCurlSegments.length,36);
 for(const [i,panel]of start.positionedCurlSegments.entries()){
  assert.equal(panel.panelX,i*10);assert.equal(Math.abs(panel.panelY),0);assert.equal(Math.abs(panel.panelZ),0);
  assert.equal(panel.panelWidth,10);assert.equal(panel.contentCropX,i*10);assert.equal(Math.abs(panel.rotationDeg),0);
 }
 const middle=pageTurnVisualPlan(.5,{direction:'from-right',page_curl:.55},'still',360,640);
 assert.equal(middle.pageTurn.rotateYDeg,-82.5);assert.equal(middle.curlAmplitudeDeg,46.75000000000001);
 assert.equal(middle.positionedCurlSegments[0].rotationDeg,-82.5);
 assert.ok(Math.abs(middle.positionedCurlSegments[35].rotationDeg+129.25)<1e-9);
 const rigid=pageTurnVisualPlan(.5,{direction:'from-right'},'video_clip',360,640);
 assert.equal(rigid.usesSegmentedCurl,false);assert.equal(rigid.positionedCurlSegments.length,0);
 const corner=pageTurnVisualPlan(.5,{direction:'from-left',page_turn_origin:'bottom-right'},'still',360,640);
 assert.equal(corner.effectiveDirection,'from-right');assert.equal(corner.positionedCurlSegments.length,28);
 assert.ok(corner.positionedCurlSegments.at(-1)!.panelY<0);assert.ok(corner.positionedCurlSegments[0].clipPath?.startsWith('polygon'));
 assert.deepEqual(corner,pageTurnVisualPlan(.5,{direction:'from-left',page_turn_origin:'bottom-right'},'still',360,640));
});

test('new descriptors do not silently promote production admission',()=>{
 for(const type of ['wipe','cube','page_turn','film_burn','camera_flash','blackout'] as const){
  assert.ok(gpuTransitionCapabilityIssue(transition(type)));
  assert.ok(gpuBoundaryVisual(transition(type),.5,'out',320,180,'still'));

 }
 assert.throws(()=>gpuBoundaryVisual(transition('wipe'),NaN,'in',320,180,'still'),/Invalid/);
});
