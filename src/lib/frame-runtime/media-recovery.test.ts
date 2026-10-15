import test from 'node:test';
import assert from 'node:assert/strict';
import {MediaRecovery} from './media-recovery';
const idle = {source:'a.m4a',target:2,readyState:1,networkState:1,paused:true,seeking:false,ended:false,bufferedEnd:3};
test('one reload for an idle metadata-only stall, not a reload loop',()=>{
 const r=new MediaRecovery();assert.equal(r.observe(idle,0),false);assert.equal(r.observe(idle,1999),false);
 assert.equal(r.observe(idle,2000),true);assert.equal(r.observe(idle,10000),false);
 assert.equal(r.observe({...idle,networkState:2},10001),false);
 assert.equal(r.observe(idle,11000),false);assert.equal(r.observe(idle,14000),false);
});
test('downloads, seeks, playing, ended and ready decoders are not restarted',()=>{
 for(const patch of [{networkState:2},{seeking:true},{paused:false},{ended:true},{readyState:3}]) {
  const r=new MediaRecovery();r.observe({...idle,...patch},0);assert.equal(r.observe({...idle,...patch},3000),false);
 }
});
test('new data restarts the quiet timer; a new source window starts a new episode',()=>{
 const r=new MediaRecovery();r.observe(idle,0);
 assert.equal(r.observe({...idle,bufferedEnd:4},1900),false);
 assert.equal(r.observe({...idle,bufferedEnd:4},3000),false);
 assert.equal(r.observe({...idle,bufferedEnd:4},3900),true);
 assert.equal(r.observe({...idle,target:10},4000),false);
 assert.equal(r.observe({...idle,target:10},6000),true);
});

test('an idle seek with buffered bytes cannot hold the timeline forever',()=>{
 const r=new MediaRecovery(),stuck={...idle,seeking:true};
 assert.equal(r.observe(stuck,0),false);assert.equal(r.observe(stuck,3999),false);
 assert.equal(r.observe(stuck,4000),true);assert.equal(r.observe(stuck,10000),false);
});
