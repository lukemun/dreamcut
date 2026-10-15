import assert from 'node:assert/strict';
import test from 'node:test';
import {mapProposalComparisonTime} from './proposal-comparison';
import type {TimelineElement} from './types';
const clip = (id: string, start: number, duration: number, rate=1) => ({id, type:'video_clip', lane_key:'visual_0', timeline_start:start, duration, playback_rate:rate, trim_start:0, trim_end:0, props:{source_duration_seconds:6}} as TimelineElement);
test('live comparison follows source time across speed changes and ripple', () => {
  const live=[clip('a',10,6),clip('b',16,6)];
  const draft=[clip('a',10,3,2),clip('b',13,6)];
  assert.equal(mapProposalComparisonTime(12,draft,live),14);
  assert.equal(mapProposalComparisonTime(15,draft,live,true),18);
  assert.equal(mapProposalComparisonTime(13,draft,live),16);
  assert.equal(mapProposalComparisonTime(13,draft,live,true),16);
});
test('comparison ignores new masks and preserves fallback times', () => {
  const live=[clip('a',10,6)];
  const overlay={...clip('mask',10,3),lane_key:'visual_mask',type:'still'} as TimelineElement;
  const draft=[overlay,clip('a',10,3,2)];
  assert.equal(mapProposalComparisonTime(11,draft,live),12);
  assert.equal(mapProposalComparisonTime(50,draft,live),50);
});
