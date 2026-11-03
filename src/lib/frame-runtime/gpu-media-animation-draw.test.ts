import test from 'node:test';
import assert from 'node:assert/strict';
import {elementAnimationFrame} from '../timeline/element-animation';
import {presetsForElementType} from '../timeline/animation-presets';
import {gpuMediaAnimationDraw} from '../gpu-preview/media-animation-draw';
test('every media-applicable preset preserves shared block pose, opacity, and repeatable seek state',()=>{
 const presets=presetsForElementType('video_clip');assert.equal(presets.length,13);
 assert.ok(!presets.includes('handwriting'));assert.ok(!presets.includes('word_pop'));
 for(const preset of presets){
  const evaluate=(frame:number)=>gpuMediaAnimationDraw(elementAnimationFrame({animationIn:preset,animationOut:preset,animationInDuration:1,animationOutDuration:1},frame,90,320,568),320,568);
  const middle=evaluate(15);evaluate(85);evaluate(0);assert.deepEqual(evaluate(15),middle);
  const settled=evaluate(45);for(const [key,value] of Object.entries({scale:1,translateX:0,translateY:0,rotateZDeg:0,width:320,height:568}))assert.ok(Math.abs(settled.group[key as keyof typeof settled.group]-value)<1e-8);assert.equal(settled.opacity,1);assert.equal(settled.postBlur,undefined);
 }
});
test('focus_settle blur remains composition pixels and sums overlapping native phases',()=>{
 const animation=elementAnimationFrame({animationIn:'focus_settle',animationOut:'focus_settle',animationInDuration:1,animationOutDuration:1},15,30,320,568);
 const draw=gpuMediaAnimationDraw(animation,320,568);
 assert.deepEqual(draw.postBlur,{x:18,y:18});
 const large=gpuMediaAnimationDraw(elementAnimationFrame({animationIn:'focus_settle',animationInDuration:1},15,90,1080,1920),1080,1920);
 assert.deepEqual(large.postBlur,{x:12,y:12});
 const small=gpuMediaAnimationDraw(elementAnimationFrame({animationIn:'focus_settle',animationInDuration:1},15,90,320,568),320,568);
 assert.deepEqual(small.postBlur,large.postBlur,'Native focus CSS blur is not scaled like transition_blur');
});
test('suppressed native phases do not leak focus blur or opacity into boundary ownership',()=>{
 const a=elementAnimationFrame({animationIn:'focus_settle',animationOut:'focus_settle',animationInDuration:1,animationOutDuration:1},15,30,320,568,{suppressIn:true,suppressOut:true});
 const p=gpuMediaAnimationDraw(a,320,568);assert.equal(p.postBlur,undefined);assert.equal(p.opacity,1);assert.equal(p.group.scale,1);
 assert.throws(()=>gpuMediaAnimationDraw({...a,blurPx:NaN},320,568),/Invalid/);
});
test('media write_on carries a group-local right wipe and omits it when fully revealed',()=>{
 const props={animationIn:'write_on',animationOut:'write_on',animationInDuration:1,animationOutDuration:1};
 const at=(frame:number,extra:Record<string,unknown>={})=>gpuMediaAnimationDraw(elementAnimationFrame({...props,...extra},frame,90,320,568),320,568);
 assert.equal(at(0).wipeRight,1);assert.equal(at(15).wipeRight,.5);assert.equal(at(45).wipeRight,undefined);assert.equal(at(75).wipeRight,.5);
 assert.ok(!('wipeRight' in at(45)));
 const pop=at(15,{animationIn:'pop'});assert.equal(pop.wipeRight,undefined);
 // Pose is unchanged by the wipe so composed animations keep the shared transform.
 assert.deepEqual(at(15).group,{scale:1,translateX:0,translateY:0,rotateZDeg:0,width:320,height:568});
 const a=elementAnimationFrame(props,15,90,320,568);
 assert.throws(()=>gpuMediaAnimationDraw({...a,wipeRight:1.5},320,568),/Invalid/);
 assert.throws(()=>gpuMediaAnimationDraw({...a,wipeRight:NaN},320,568),/Invalid/);
});
