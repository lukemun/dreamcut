import assert from 'node:assert/strict';
import test from 'node:test';
import {applyElementPatch} from '@/lib/local-store/element-patch';
import type {TimelineElement} from '@/components/studio/timeline/types';
import {minTimelineDurationSeconds, projectFrameRate, quantizeVisualFrameSpan, toVisualFrame} from './frame-quantization';
import {requantizeTimelineForFrameRate} from './frame-rate-change';
import {currentFrameRate, withFrameRate} from './frame-rate-scope';

const onGrid = (seconds: number, fps: number) => Math.abs(seconds * fps - Math.round(seconds * fps)) < 1e-9;

function clip(id: string, type: string, timeline_start: number, duration: number, extra: Partial<TimelineElement> = {}): TimelineElement {
  return {id, project_id: 'p', type, source_url: null, props: null, beat_id: null, voice_clip_id: null, character_id: null,
    timeline_start, duration, lane_key: 'visual_0', lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0,
    playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null, created_at: '', updated_at: '', ...extra} as TimelineElement;
}

test('projects without a rate are 30 fps; only supported rates are accepted', () => {
  assert.equal(projectFrameRate({}), 30);
  assert.equal(projectFrameRate({frame_rate: 60}), 60);
  assert.equal(projectFrameRate({frame_rate: 29.97}), 30);
  assert.equal(projectFrameRate(null), 30);
});

test('a rate change moves picture clips onto the new grid and keeps cuts touching', () => {
  // Three 30 fps clips with cuts at 31 and 47 frames: neither lands on the 24 fps grid.
  const elements = [
    clip('a', 'video_clip', 0, 31 / 30, {trim_start: 7 / 30, trim_end: 11 / 30}),
    clip('b', 'still', 31 / 30, 16 / 30),
    clip('c', 'video_clip', 47 / 30, 1),
    clip('caption', 'caption_text', 0.517, 0.9),
  ];
  for (const fps of [24, 25, 50, 60]) {
    const next = requantizeTimelineForFrameRate(elements, fps);
    for (const element of next.filter(e => e.type !== 'caption_text')) {
      assert.ok(onGrid(element.timeline_start, fps) && onGrid(element.duration, fps), `${element.id} at ${fps}`);
    }
    assert.ok(onGrid(next[0].trim_start, fps) && onGrid(next[0].trim_end!, fps), `trims at ${fps}`);
    for (let i = 0; i < 2; i++) {
      assert.equal(toVisualFrame(next[i].timeline_start + next[i].duration, fps), toVisualFrame(next[i + 1].timeline_start, fps), `cut ${i} at ${fps}`);
    }
    assert.deepEqual(next[3], elements[3], 'captions keep their exact times');
  }
  // Already on the grid: unchanged.
  assert.deepEqual(requantizeTimelineForFrameRate(elements.slice(2, 3), 30), elements.slice(2, 3));
});

test('the scoped rate drives default snapping and is restored after an error', () => {
  assert.equal(currentFrameRate(), 30);
  withFrameRate(60, () => {
    assert.equal(quantizeVisualFrameSpan(1.01, .5).timeline_start, 61 / 60);
    assert.equal(minTimelineDurationSeconds(), 1 / 60);
    withFrameRate(24, () => assert.equal(quantizeVisualFrameSpan(1.01, .5).timeline_start, 1));
    assert.equal(currentFrameRate(), 60);
  });
  assert.throws(() => withFrameRate(25, () => { throw Error('boom'); }), /boom/);
  assert.equal(currentFrameRate(), 30);
});

test('element patches snap to the project rate they are given', () => {
  const patched = applyElementPatch(clip('v', 'video_clip', 0, 1), {timeline_start: 1.01, trim_start: .26}, {fps: 60});
  assert.equal(patched.timeline_start, 61 / 60);
  assert.equal(patched.trim_start, 16 / 60);
  const at30 = applyElementPatch(clip('v', 'video_clip', 0, 1), {timeline_start: 1.01});
  assert.equal(at30.timeline_start, 30 / 30);
});
