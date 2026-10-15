import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaPictureAtFrame,mediaPicturePlan,mediaPictureTrimWindow} from './media-picture-plan';
const clip={type:'video_clip',timeline_start:1,duration:4,trim_start:1,trim_end:1,playback_rate:2,props:{source_duration_seconds:6}};
test('trim source units and half-open timeline activity remain distinct at 2x',()=>{
 assert.equal(mediaPictureAtFrame(clip,29),null);
 assert.equal(mediaPictureAtFrame(clip,150),null);
 assert.equal(mediaPictureAtFrame(clip,30)!.sourceTimeSeconds,1);
 assert.equal(mediaPictureAtFrame(clip,60)!.sourceTimeSeconds,3);
 assert.deepEqual(mediaPictureTrimWindow(clip),{trimBefore:30,trimAfter:150,sourceEndFrame:150});
 assert.equal(mediaPictureAtFrame(clip,90)!.phase,'tail');
 assert.equal(mediaPictureAtFrame(clip,149)!.sourceTimeSeconds,149/30);
});
test('head and tail freeze only source picture while effect clock continues',()=>{
 const e={...clip,duration:5,props:{...clip.props,leading_hold_duration_seconds:1}};
 const p=mediaPicturePlan(e);
 assert.equal(p.leadingHoldFrames,30);assert.equal(p.playableDurationFrames,60);assert.equal(p.overflowDurationFrames,60);
 assert.deepEqual(mediaPictureAtFrame(e,59),{phase:'head',localFrame:29,sourceTimeSeconds:1});
 assert.equal(mediaPictureAtFrame(e,60)!.sourceTimeSeconds,1);
 assert.equal(mediaPictureAtFrame(e,120)!.phase,'tail');
 assert.equal(mediaPictureAtFrame(e,179)!.localFrame,149);
});
test('speed boundary and source-limited holds use the same source mapping',()=>{
 const e={...clip,duration:7,props:{source_duration_seconds:6,
  keyframes:{playback_rate:[{t:1,source_t:3,v:.5,ease:'hold'}]}}};
 const p=mediaPicturePlan(e);
 assert.equal(p.playbackSegments.length,2);
 assert.equal(mediaPictureAtFrame(e,59)!.sourceTimeSeconds,1+29/30*2);
 assert.equal(mediaPictureAtFrame(e,60)!.sourceTimeSeconds,3);
 assert.equal(mediaPictureAtFrame(e,75)!.sourceTimeSeconds,3.25);
 assert.equal(mediaPictureAtFrame(e,180)!.phase,'tail');
 assert.equal(mediaPictureAtFrame(e,180)!.sourceTimeSeconds,149/30);
});
test('partially probed sources retain a usable moving picture plan',()=>{
 const e={...clip,duration:1,props:{}};
 assert.equal(mediaPicturePlan(e).playbackSegments.length,1);
 assert.equal(mediaPictureAtFrame(e,45)!.sourceTimeSeconds,2);
});

test('an explicit legacy media limit freezes after its playable window',()=>{
 const e={...clip,duration:4,trim_end:null,props:{media_limit_duration_seconds:2}};
 assert.equal(mediaPictureAtFrame(e,89)!.phase,'moving');
 assert.equal(mediaPictureAtFrame(e,90)!.phase,'tail');
 assert.equal(mediaPictureAtFrame(e,90)!.sourceTimeSeconds,149/30);
});

test('a reversed clip plays its used source window from the end back to the start, with swapped holds',()=>{
 const e={...clip,duration:5,props:{...clip.props,playback_reverse:true,leading_hold_duration_seconds:1}};
 // Source window 1..5 at 2x is two seconds of timeline after a one-second head hold.
 assert.deepEqual(mediaPictureAtFrame(e,59),{phase:'head',localFrame:29,sourceTimeSeconds:149/30});
 assert.equal(mediaPictureAtFrame(e,60)!.sourceTimeSeconds,149/30);
 assert.equal(mediaPictureAtFrame(e,61)!.sourceTimeSeconds,147/30);
 assert.equal(mediaPictureAtFrame(e,119)!.sourceTimeSeconds,31/30);
 assert.equal(mediaPictureAtFrame(e,120)!.phase,'tail');
 assert.equal(mediaPictureAtFrame(e,120)!.sourceTimeSeconds,1);
 // Speed steps do not apply to a reversed clip.
 const stepped={...e,props:{...e.props,keyframes:{playback_rate:[{t:1,source_t:3,v:.5,ease:'hold'}]}}};
 assert.equal(mediaPicturePlan(stepped).playbackSegments.length,1);
 assert.equal(mediaPictureAtFrame(stepped,61)!.sourceTimeSeconds,147/30);
});
