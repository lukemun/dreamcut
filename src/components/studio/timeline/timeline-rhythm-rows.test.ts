import test from 'node:test';
import assert from 'node:assert/strict';
import { rhythmSourceAt, rhythmTimelineAt, editRhythmHit, rhythmRowsHeight, clearRhythmInstrumentHits } from './timeline-rhythm-rows';
import { instrumentResultSchema, instrumentSettingsSchema } from '@/lib/timeline/instrument-analysis';
import type { TimelineElement } from './types';
const clip = { timeline_start: 10, duration: 5, trim_start: 20, playback_rate: 2, props: null } as TimelineElement;
test('inline rhythms follow slipped source handles, rate and clip bounds', () => {
  assert.equal(rhythmSourceAt(clip, 12), 24);
  assert.equal(rhythmTimelineAt(clip, 24), 12);
  assert.equal(rhythmTimelineAt(clip, 19), null);
  assert.equal(rhythmTimelineAt(clip, 30), null);
  assert.equal(rhythmSourceAt(clip, 15), null);
});
const result = instrumentResultSchema.parse({ state: 'ready', source_sha256: 'a'.repeat(64), model: 'htdemucs', duration: 40, sample_rate: 100, sample_count: 4000, lanes: ['mix','drums','bass','other','vocals'].map(id => ({ id, peaks: [.1], hits: [{time_seconds: 24, strength: 1}], rms: .1 })) });
const settings = instrumentSettingsSchema.parse({ selected: ['drums'], minimum_strength: .5 });
test('collapsing instrument views releases timeline space without changing the clip', () => {
  assert.equal(rhythmRowsHeight(false, []), 312);
  assert.equal(rhythmRowsHeight(false, ['bass']), 288);
  assert.equal(rhythmRowsHeight(false, ['bass', 'bass']), 288);
  assert.equal(rhythmRowsHeight(true, ['bass']), 48);
});
test('clearing an instrument selection preserves every other instrument and manual candidate', () => {
  const next = clearRhythmInstrumentHits(result, settings, 'bass');
  assert.deepEqual(next.marked_hits, []);
  const picked = editRhythmHit(result, next, 'bass', 24);
  assert.ok(picked.marked_hits?.includes('bass:24.000000'));
  assert.equal(settings.marked_hits, undefined);
});
test('marking and manual hits preserve other instruments and saved sets', () => {
  const next = editRhythmHit(result, settings, 'drums', 24);
  assert.deepEqual(next.marked_hits, ['drums:24.000000']);
  assert.equal(settings.marked_hits, undefined);
  const manual = editRhythmHit(result, next, 'drums', 25, true);
  assert.ok(manual.marked_hits?.includes('drums:25.000000'));
  assert.equal(manual.manual_hits.length, 1);
  assert.equal(editRhythmHit(result, manual, 'drums', 25, true).manual_hits.length, 1);
});
