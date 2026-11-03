import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaTextImagePhase,mediaTextVideoClock} from './media-text-fill';

test('media-filled text cycles at exact boundaries and remains deterministic after backward seeks',()=>{
 for(const [time,current,next,opacity] of [[0,0,1,0],[.875,0,1,.5],[1,1,2,0],[2,2,0,0],[3,0,1,0],[.875,0,1,.5],[-1,0,1,0]]){
  const phase=mediaTextImagePhase(3,time,1,.25)!;
  assert.equal(phase.currentIndex,current);assert.equal(phase.nextIndex,next);assert.equal(phase.nextOpacity,opacity);
 }
 assert.equal(mediaTextImagePhase(0,0,1,.2),null);
 assert.deepEqual(mediaTextImagePhase(1,.875,1,.25),{currentIndex:0,nextIndex:0,progress:.875,nextOpacity:.5});
});

test('image holds have a minimum and cuts never acquire a second visible image',()=>{
 assert.equal(mediaTextImagePhase(2,.15,0,0)!.currentIndex,1);
 for(const time of [.1,.99,1,1.9])assert.equal(mediaTextImagePhase(2,time,1,0)!.nextOpacity,0);
 assert.equal(mediaTextImagePhase(2,0,1,99)!.nextOpacity,0);
 assert.ok(mediaTextImagePhase(2,.5,1,99)!.nextOpacity>0);
 assert.throws(()=>mediaTextImagePhase(-1,0,1,0));
 assert.throws(()=>mediaTextImagePhase(2,NaN,1,0));
});

test('video fill rounds the scene offset once then uses the local source rate',()=>{
 assert.deepEqual(mediaTextVideoClock(0,30,1.013,1.5),{trimBefore:46,sourceTimeSeconds:46/30});
 assert.deepEqual(mediaTextVideoClock(12,30,1.013,1.5),{trimBefore:46,sourceTimeSeconds:64/30});
 assert.equal(mediaTextVideoClock(-3,30,1.013,1.5).sourceTimeSeconds,46/30);
 assert.equal(mediaTextVideoClock(30,30,0,.25).sourceTimeSeconds,.25);
 for(const args of [[0,0,0,1],[0,30,-1,1],[0,30,0,0],[NaN,30,0,1]])assert.throws(()=>mediaTextVideoClock(...args as [number,number,number,number]));
});
