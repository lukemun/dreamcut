import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSeekPreview, previewFollowerRate, previewTargetTime } from './preview-sync';
import { speedStepFrame, resolveSpeedStepSegments } from '../timeline/speed-steps';
const input = {currentTime: 0, target: 1, rate: 1, tolerance: 2/30, playing: true, seeking: false, ready: true, explicitSeek: false, now: 1000, lastSeekAt: 900};
test('drift correction is bounded, but an explicit user seek is never delayed by cooldown', () => {
  assert.equal(shouldSeekPreview(input), false);
  assert.equal(shouldSeekPreview({...input, now: 1150}), true);
  assert.equal(shouldSeekPreview({...input, explicitSeek: true}), true);
  assert.equal(shouldSeekPreview({...input, explicitSeek: true, seeking: true}), false);
  assert.equal(shouldSeekPreview({...input, playing: false}), true);
  assert.equal(shouldSeekPreview({...input, ready: false}), false);
});
test('accelerated source time does not amplify the allowed timeline drift', () => {
  assert.equal(shouldSeekPreview({...input, lastSeekAt: 0, target: .2, rate: 4}), false);
  assert.equal(shouldSeekPreview({...input, lastSeekAt: 0, target: .3, rate: 4}), true);
  assert.equal(shouldSeekPreview({...input, lastSeekAt: 0, target: .03, rate: .25}), true);
});
test('an advancing audible clock is not sought back to its own quantized frame; user seeks still work', () => {
  assert.equal(shouldSeekPreview({...input, clockOwner: true, lastSeekAt: 0}), false);
  assert.equal(shouldSeekPreview({...input, clockOwner: true, explicitSeek: true}), true);
  assert.equal(shouldSeekPreview({...input, clockOwner: true, playing: false}), true);
  assert.equal(shouldSeekPreview({...input, clockOwner: false, lastSeekAt: 0}), true);
});
test('persistent decoder preserves the original quantized section clock, including backwards seeks', () => {
  const segments = resolveSpeedStepSegments({duration:10, playback_rate:.5, trim_start:.17, props:{source_duration_seconds:5, keyframes:{playback_rate:[{t:1,source_t:1.31,v:4},{t:2,source_t:2.25,v:.25},{t:3,source_t:3.41,v:2}]}}});
  const count=Math.round(segments.at(-1)!.timelineEnd*30);
  for(const frame of [...Array.from({length:count},(_,i)=>i),17,2,count-1,0]) {
    const segment=segments.find(s=>frame<Math.round(s.timelineEnd*30))!;
    const expected=Math.round(segment.sourceStart*30)/30+(frame-Math.round(segment.timelineStart*30))/30*segment.playbackRate;
    assert.equal(speedStepFrame(segments,frame,30).sourceTimeSeconds,expected);
  }
});

test('silent followers converge with bounded rate corrections without altering authored timing',()=>{
 assert.equal(previewFollowerRate(2,0),2);
 assert.equal(previewFollowerRate(2,.01),2);
 assert.equal(previewFollowerRate(2,.1),2.8);
 assert.equal(previewFollowerRate(2,1),3);
 assert.equal(previewFollowerRate(2,-1),1);
 assert.equal(previewFollowerRate(1/16,-1),1/16);
 assert.equal(previewFollowerRate(16,1),16);
});

test('a playing video mounted before metadata never produces a non-finite DOM rate', () => {
  const target = previewTargetTime(2.5, 1, NaN);
  assert.equal(target, 2.5);
  assert.equal(shouldSeekPreview({...input, target, ready: false}), false);
  assert.equal(previewFollowerRate(2, (target - 0) / 2), 3);
  for (const drift of [NaN, Infinity, -Infinity]) assert.equal(previewFollowerRate(2, drift), 2);
  for (const rate of [NaN, Infinity, -Infinity, 0, -1]) assert.equal(previewFollowerRate(rate, NaN), 1);
  assert.equal(previewTargetTime(2.5, 1, Infinity), 2.5);
  assert.equal(previewTargetTime(12, 1, 10), 9.99999);
  assert.equal(previewTargetTime(0, 1, 10), 1);
});
