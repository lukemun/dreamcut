import test from 'node:test';
import assert from 'node:assert/strict';
import {captionAnimationProgress} from './caption-animation-progress';

test('caption entrance and exit share quantized local boundaries',()=>{
 const props={animationInDuration:.4,animationOutDuration:.4};
 assert.deepEqual(captionAnimationProgress(props,0,2),{durationInFrames:60,inProgress:0,outProgress:0});
 assert.deepEqual(captionAnimationProgress(props,6,2),{durationInFrames:60,inProgress:.5,outProgress:0});
 assert.deepEqual(captionAnimationProgress(props,54,2),{durationInFrames:60,inProgress:1,outProgress:.5});
 assert.deepEqual(captionAnimationProgress(props,59,2),{durationInFrames:60,inProgress:1,outProgress:11/12});
});
test('zero-duration reveals do not introduce blank frames and short clips permit overlap',()=>{
 assert.deepEqual(captionAnimationProgress({animationInDuration:0,animationOutDuration:0},0,.001),{durationInFrames:1,inProgress:1,outProgress:0});
 const progress=captionAnimationProgress({animationInDuration:1,animationOutDuration:1},6,.4);
 assert.equal(progress.durationInFrames,12);assert.equal(progress.inProgress,.2);assert.equal(progress.outProgress,.8);
});

test('inverse drift and sweep share endpoints, clamping and a one-frame clock',async()=>{
 const {captionInverseProgress}=await import('./caption-animation-progress');
 assert.deepEqual(captionInverseProgress(-1,61),{timeline:0,motion:0});
 assert.deepEqual(captionInverseProgress(60,61),{timeline:1,motion:1});
 assert.deepEqual(captionInverseProgress(0,1),{timeline:1,motion:1});
 const middle=captionInverseProgress(30,61);assert.equal(middle.timeline,.5);assert.ok(Math.abs(middle.motion-.5)<1e-12);
});
