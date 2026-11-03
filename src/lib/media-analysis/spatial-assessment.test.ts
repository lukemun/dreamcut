import assert from 'node:assert/strict';
import test from 'node:test';
import { discreteObservationCoverage } from './observation-coverage';
import { assessSpatialComposition, type SpatialSourceEvidence } from './spatial-assessment';
import type { TimelineElement } from '../../components/studio/timeline/types';

const visual = { id: 'v', type: 'video_clip', lane_key: 'visual_0', timeline_start: 10, duration: 2,
  trim_start: 2, playback_rate: 2, source_url: '/video', props: {} } as TimelineElement;
const caption = { id: 'c', type: 'caption_text', lane_key: 'captions_0', timeline_start: 10, duration: 2,
  props: { text: 'A', absX: 0.4, absY: 0.4, maxWidth: 0.2, fontSizePx: 84, animationIn: 'none', animationOut: 'none' } } as TimelineElement;
const evidence: SpatialSourceEvidence = { revision: 'r1', source_id: 'source', status: 'sampled', reason: null,
  width: 1000, height: 1000, observed_times: [2, 3], tracks: [{ analysis_revision: 'r1', track_id: 'face_1',
    shot_id: 'shot_1', label: 'face', start_seconds: 2, end_seconds: 3, confidence: 0.9,
    samples: [2, 3].map(t => ({ detection_id: `d${t}`, frame_id: `f${t}`, time_seconds: t, confidence: 0.9,
      box: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 } })) }] };
function assess(props = {}, source = evidence) {
  return assessSpatialComposition({ elements: [{ ...visual, props }, caption], sources: { v: source }, canvas: { width: 1000, height: 1000 },
    lane_order: ['captions_0', 'visual_0'], snapshot_id: 'snapshot' });
}
test('coverage preserves examined empty frames, gaps, and the unexamined tail beyond the cap', () => {
  const coverage = discreteObservationCoverage(Array.from({ length: 240 }, (_, i) => i * 0.5), 300);
  assert.equal(coverage.status, 'partial');
  assert.deepEqual(coverage.ranges[239], [119.5, 119.5]);
  assert.deepEqual(coverage.gaps.at(-1), [119.5, 300]);
  assert.equal(discreteObservationCoverage([], 5).status, 'unavailable');
});
test('source trim and speed map real observations to timeline time; overlap stays advisory', () => {
  const result = assess();
  assert.equal(result.status, 'sampled');
  assert.deepEqual(result.observations.map(o => o.at_seconds), [10, 10.5]);
  assert.equal(result.observations[0]?.overlap_fraction, 1);
  assert.match(result.observations[0]!.statement, /Pixel occlusion is unmeasured/);
  assert.ok(result.limitations.some(l => l.includes('Between-sample')));
});
test('shared media translation changes geometric relationships without rewriting evidence', () => {
  assert.equal(assess({ media_offset_x: 0.8 }).observations[0]?.overlap_fraction, 0);
  assert.equal(evidence.tracks[0]?.samples[0]?.box.x, 0.4);
});
test('unknown effects, missing evidence and empty detections never yield a clearance verdict', () => {
  assert.equal(assess({ surfaceMode: 'wall' }).status, 'unknown');
  assert.equal(assess({}, { ...evidence, status: 'unknown', reason: 'Stale' }).status, 'unknown');
  const empty = assess({}, { ...evidence, tracks: [] });
  assert.equal(empty.status, 'sampled');
  assert.equal(empty.examined_samples, 2);
  assert.deepEqual(empty.observations, []);
  assert.ok(empty.limitations.some(l => l.includes('detector accuracy')));
});
test('hidden lanes do not produce overlap statements', () => {
  const result = assessSpatialComposition({ elements: [visual, caption], sources: { v: evidence }, canvas: { width: 1000, height: 1000 },
    lane_order: ['captions_0', 'visual_0'], hidden_lanes: ['visual_0'], snapshot_id: 's' });
  assert.equal(result.status, 'unknown');
  assert.deepEqual(result.observations, []);
});
test('an unsupported caption cannot report an assessed sample', () => {
  const result = assessSpatialComposition({ elements: [visual, { ...caption, props: { ...caption.props, animationIn: 'slide_up' } }],
    sources: { v: evidence }, canvas: { width: 1000, height: 1000 }, lane_order: ['captions_0', 'visual_0'], snapshot_id: 's' });
  assert.equal(result.status, 'unknown');
  assert.equal(result.examined_samples, 0);
});
