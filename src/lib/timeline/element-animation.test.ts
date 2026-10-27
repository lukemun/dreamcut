import test from 'node:test';
import assert from 'node:assert/strict';
import {animationStyle,elementAnimationFrame} from './element-animation';

test('actor animation uses a whole-clip frame clock with quantized durations and simultaneous endpoints',()=>{
 const props={animationIn:'fade',animationOut:'pop',animationInDuration:.5,animationOutDuration:.5};
 assert.equal(elementAnimationFrame(props,0,90,1080,1920).opacity,0);
 assert.equal(elementAnimationFrame(props,15,90,1080,1920).opacity,1);
 const end=elementAnimationFrame(props,82.5,90,1080,1920);
 assert.equal(end.opacity,.5);assert.equal(end.scale,.96);
 assert.equal(elementAnimationFrame(props,90,90,1080,1920).opacity,0);
 assert.equal(elementAnimationFrame(props,0,90,1080,1920,{suppressIn:true}).opacity,1);
 assert.equal(elementAnimationFrame(props,90,90,1080,1920,{suppressOut:true}).opacity,1);
 assert.equal(elementAnimationFrame({...props,animationInDuration:0,animationOutDuration:0},0,1,1080,1920).opacity,1);
 assert.equal(elementAnimationFrame(props,30,180,1080,1920,{fps:60}).opacity,1);
});

test('media slide, drop, scale and rotation preserve shared canvas-relative directions',()=>{
 assert.deepEqual(animationStyle('slide_up',0,'in',1080,1920),{opacity:0,translateX:0,translateY:96,scale:1});
 assert.equal(animationStyle('slide_right',0,'in',1080,1920).translateX,-86.4);
 assert.equal(animationStyle('drop_in',0,'in',1080,1920).translateY,-864);
 assert.ok(animationStyle('drop_in',1,'in',1080,1920).translateY===0);
 assert.equal(animationStyle('spring_pop',0,'in',1080,1920).scale,.72);
 assert.equal(animationStyle('spring_pop',1,'in',1080,1920).scale,1);
 assert.equal(animationStyle('rotate_in',0,'in',1080,1920).rotateZDeg,-18);
 assert.ok(animationStyle('rotate_in',1,'in',1080,1920).rotateZDeg===0);
});

test('write_on exposes a numeric right-edge wipe; in and out combine as the larger share',()=>{
 assert.equal(animationStyle('write_on',0,'in',1080,1920).wipeRight,1);
 assert.equal(animationStyle('write_on',.25,'in',1080,1920).wipeRight,.75);
 assert.equal(animationStyle('write_on',1,'in',1080,1920).wipeRight,0);
 assert.equal(animationStyle('write_on',0,'out',1080,1920).wipeRight,0);
 assert.equal(animationStyle('write_on',.25,'out',1080,1920).wipeRight,.25);
 assert.equal(animationStyle('write_on',1,'out',1080,1920).wipeRight,1);
 // Caption clip path is unchanged and agrees with the numeric wipe.
 assert.equal(animationStyle('write_on',.25,'in',1080,1920).clipPath,'inset(0 75% 0 0)');
 assert.equal(animationStyle('write_on',.25,'out',1080,1920).clipPath,'inset(0 25% 0 0)');
 assert.equal(animationStyle('fade',.5,'in',1080,1920).wipeRight,undefined);
 const props={animationIn:'write_on',animationOut:'write_on',animationInDuration:1,animationOutDuration:1};
 assert.equal(elementAnimationFrame(props,0,90,1080,1920).wipeRight,1);
 assert.equal(elementAnimationFrame(props,15,90,1080,1920).wipeRight,.5);
 assert.equal(elementAnimationFrame(props,45,90,1080,1920).wipeRight,0);
 assert.equal(elementAnimationFrame(props,75,90,1080,1920).wipeRight,.5);
 assert.equal(elementAnimationFrame(props,90,90,1080,1920).wipeRight,1);
 // Overlap (clip shorter than in+out): in at 2/3 hides 1/3, out at 2/3 hides 2/3.
 assert.ok(Math.abs(elementAnimationFrame(props,20,30,1080,1920).wipeRight-2/3)<1e-12);
 assert.ok(Math.abs(elementAnimationFrame({...props,animationOut:'fade'},20,30,1080,1920).wipeRight-1/3)<1e-12);
 assert.equal(elementAnimationFrame(props,0,90,1080,1920,{suppressIn:true}).wipeRight,0);
 assert.equal(elementAnimationFrame({animationIn:'pop',animationOut:'fade',animationInDuration:1,animationOutDuration:1},10,90,1080,1920).wipeRight,0);
});
