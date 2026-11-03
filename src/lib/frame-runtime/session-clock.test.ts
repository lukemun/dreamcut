import {retryPlaybackPermission} from "./session";
import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameSession, type MediaEntry} from './session';
function entry(): MediaEntry {return {active:true,pauseWhenBuffering:true,kind:'video',timelineFrame:30,target:2,sample:{id:'v',src:'v',time:2,rate:2,volume:1,preservePitch:true},element:{currentTime:2.2,readyState:4,seeking:false,ended:false,pause(){}} as HTMLMediaElement};}
test('media clock accounts for source speed and relinquishes ended or unready media',()=>{
 const s=new FrameSession(),e=entry();s.media.set('v',e);
 assert.ok(Math.abs(s.previewClock(30)!-33)<1e-8);
 Object.assign(e.element,{paused:true});assert.equal(s.previewClock(30),null);
 Object.assign(e.element,{paused:false});
 Object.assign(e.element,{ended:true});assert.equal(s.previewClock(30),null);
 Object.assign(e.element,{ended:false,readyState:2});assert.equal(s.previewClock(30),null);assert.equal(s.buffering(),true);
 Object.assign(e.element,{readyState:4});e.sample!.volume=0;assert.equal(s.previewClock(30),null);
});
test('external mixer owns clock and readiness only for its session lifetime',()=>{
 const s=new FrameSession();s.media.set('v',entry());s.externalClock=()=>80;s.externalBuffering=()=>true;
 assert.equal(s.previewClock(30),80);assert.equal(s.buffering(),true);
 s.externalClock=()=>null;assert.ok(Math.abs(s.previewClock(30)!-33)<1e-8);
 s.dispose();assert.equal(s.previewClock(30),null);assert.equal(s.buffering(),false);
});
test('an undecoded still holds playback until decode completes or it unmounts',()=>{
 const s=new FrameSession(),key=Symbol('cold image');
 s.visualResources.set(key,'cutout.png');assert.equal(s.buffering(),true);
 s.visualResources.delete(key);assert.equal(s.buffering(),false);
 s.visualResources.set(key,'next.png');s.dispose();assert.equal(s.buffering(),false);
});
test('silent video needs a decoded first frame without becoming the audio clock',()=>{
 const s=new FrameSession(),e=entry();e.pauseWhenBuffering=false;e.sample=null;e.firstFrameReady=false;
 s.media.set('overlay',e);Object.assign(e.element,{readyState:1});
 assert.equal(s.buffering(),true);assert.equal(s.previewClock(30),null);
 Object.assign(e.element,{readyState:2});e.firstFrameReady=true;assert.equal(s.buffering(),false);
 Object.assign(e.element,{readyState:1,seeking:true});assert.equal(s.buffering(),false);
 e.firstFrameReady=false;
 Object.assign(e.element,{readyState:1});e.active=false;assert.equal(s.buffering(),false);
});

test('an installed but idle mixer does not steal clock ownership from narration',()=>{
 const s=new FrameSession(),e=entry();s.media.set('v',e);
 s.externalClock=()=>null;assert.equal(s.isPreviewClockOwner(e.element),true);
 s.externalClock=()=>80;assert.equal(s.isPreviewClockOwner(e.element),false);
 s.externalClock=()=>NaN;assert.equal(s.isPreviewClockOwner(e.element),true);
});


test('a new Play gesture clears denied autoplay without hiding decoding failures', () => {
  const session = new FrameSession();
  session.fail(new DOMException('Interaction required', 'NotAllowedError'));
  assert.equal(retryPlaybackPermission(session), true);
  assert.equal(session.error, null);
  const decode = new Error('Decoder failed'); session.fail(decode);
  assert.equal(retryPlaybackPermission(session), false);
  assert.equal(session.error, decode);
});
