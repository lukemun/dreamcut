import test from 'node:test';import assert from 'node:assert/strict';import {nativeLoopTime,nativeSampleTime} from './source-time';import {nativeClockPosition} from './source-clock';
test('natural and trimmed loops wrap at source EOF instead of holding the final frame',()=>{
 assert.ok(Math.abs(nativeLoopTime(3.1,3,{start:0})-.1)<1e-9);
 assert.equal(nativeLoopTime(4,3,{start:1}),2);
 assert.equal(nativeLoopTime(3,5,{start:1,end:2}),1);
 assert.equal(nativeLoopTime(3,3),3);
 assert.throws(()=>nativeLoopTime(3,3,{start:3}),/loop window/);
});

test('native sampling shows the source frame the 30 fps preview proxy shows',()=>{
 // 29.97 fps: timeline frame 1 must show source frame 1, not repeat frame 0.
 const ntsc=Array.from({length:90},(_,i)=>i*1001/30000);
 for(let frame=0;frame<89;frame++)assert.equal(nativeClockPosition(ntsc,nativeSampleTime(frame/30,3)).source_index,Math.min(89,Math.floor((frame+.5)*30000/1001/30-1e-9)),`frame ${frame}`);
 // 60 fps: a source frame starting exactly on the slot midpoint belongs to the next slot.
 const sixty=Array.from({length:120},(_,i)=>i/60);
 for(let frame=0;frame<59;frame++)assert.equal(nativeClockPosition(sixty,nativeSampleTime(frame/30,2)).source_index,2*frame);
 assert.ok(nativeSampleTime(89/30,3)<3,'never beyond the window end');
 // Another cadence has no proxy to match: the authored time passes through unchanged.
 assert.equal(nativeSampleTime(.32,2,50),.32);
});
