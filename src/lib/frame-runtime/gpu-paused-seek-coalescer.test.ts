import test from 'node:test';
import assert from 'node:assert/strict';
import {PausedSeekCoalescer,isForwardScrubStep} from '../gpu-preview/paused-seek-coalescer';

test('scrub seeks while a paused picture is in flight keep only the latest target', () => {
 const scrub=new PausedSeekCoalescer<number>();
 const first=scrub.offer(10,true);
 assert.notEqual(first,null);
 // Pointer moves during the in-flight decode neither cancel it nor queue each frame.
 assert.equal(scrub.offer(11,true),null);
 assert.equal(scrub.offer(25,true),null);
 assert.equal(scrub.offer(18,true),null);
 // The finished picture is shown; the exact latest target is prepared next.
 assert.equal(scrub.settle(first!),18);
 const second=scrub.offer(18,true);
 assert.notEqual(second,null);
 // Release: nothing further is deferred, so the settled frame is the final target.
 assert.equal(scrub.settle(second!),undefined);
});

test('a single paused seek is prepared immediately', () => {
 const scrub=new PausedSeekCoalescer<number>();
 const token=scrub.offer(42,true);
 assert.notEqual(token,null);
 assert.equal(scrub.settle(token!),undefined);
 assert.notEqual(scrub.offer(43,true),null);
});

test('playing requests are never deferred and discard a deferred scrub target', () => {
 const scrub=new PausedSeekCoalescer<number>();
 const paused=scrub.offer(5,true)!;
 assert.equal(scrub.offer(9,true),null);
 const playing=scrub.offer(9,false);
 assert.notEqual(playing,null);
 assert.notEqual(scrub.offer(10,false),null);
 // The superseded paused request settling later cannot dispatch stale work.
 assert.equal(scrub.settle(paused),undefined);
 assert.equal(scrub.settle(playing!),undefined);
 // After playback a pause is prepared immediately.
 assert.notEqual(scrub.offer(12,true),null);
});

test('only an older paused request settling does not release a newer one', () => {
 const scrub=new PausedSeekCoalescer<number>();
 const old=scrub.offer(1,true)!;
 scrub.offer(2,false);
 const current=scrub.offer(3,true)!;
 assert.equal(scrub.offer(4,true),null);
 assert.equal(scrub.settle(old),undefined);
 assert.equal(scrub.offer(5,true),null,'the newer paused request is still in flight');
 assert.equal(scrub.settle(current),5);
});

test('forward scrub steps within half a second keep sequential decoders', () => {
 assert.equal(isForwardScrubStep(100,101,30),true);
 assert.equal(isForwardScrubStep(100,115,30),true);
 assert.equal(isForwardScrubStep(100,116,30),false);
 assert.equal(isForwardScrubStep(100,100,30),false);
 assert.equal(isForwardScrubStep(100,90,30),false);
 assert.equal(isForwardScrubStep(100,112,24),true);
 assert.equal(isForwardScrubStep(100,113,24),false);
});
