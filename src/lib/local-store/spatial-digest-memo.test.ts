import assert from 'node:assert/strict';
import test from 'node:test';
import type { TimelineFile } from './store';
import { spatialTimelineDigest } from './spatial-assessment';
import type { TimelineElement } from '../../components/studio/timeline/types';

const element = (id: string) => ({ id, project_id: 'fixture', type: 'caption_text', lane_key: 'captions_0', timeline_start: 0, duration: 1,
  playback_rate: 1, source_url: null, props: { text: id, style: { size: 40, words: [{ t: 0, w: id }] } } }) as unknown as TimelineElement;
const timelineOf = (...elements: TimelineElement[]) => ({ elements, transitions: [] }) as unknown as TimelineFile;
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); }
  return value;
};

test('a deep-frozen row digests as its unfrozen copy does, on every call', () => {
  const rows = Array.from({ length: 50 }, (_, i) => element(`e${i}`));
  const fresh = spatialTimelineDigest(timelineOf(...structuredClone(rows)));
  const frozen = rows.map(deepFreeze);
  assert.equal(spatialTimelineDigest(timelineOf(...frozen)), fresh);
  assert.equal(spatialTimelineDigest(timelineOf(...frozen)), fresh, 'the remembered text gives the same digest');
  // Shared frozen rows beside new ones (a derive that changes only some rows) and a new order.
  const edited = { ...structuredClone(rows[3]!), timeline_start: 2 } as TimelineElement;
  const mixed = [...frozen.slice(0, 3), edited, ...frozen.slice(4)];
  assert.equal(spatialTimelineDigest(timelineOf(...mixed)), spatialTimelineDigest(timelineOf(...structuredClone(mixed))));
  assert.notEqual(spatialTimelineDigest(timelineOf(...mixed)), fresh);
  assert.equal(spatialTimelineDigest(timelineOf(...[...frozen].reverse())), spatialTimelineDigest(timelineOf(...structuredClone(rows).reverse())));
});

test('rows that can still change are read as they are now', () => {
  const unfrozen = element('a');
  const timeline = timelineOf(unfrozen);
  const before = spatialTimelineDigest(timeline);
  (unfrozen.props as { text: string }).text = 'edited';
  assert.notEqual(spatialTimelineDigest(timeline), before);
  // A frozen row whose props are not frozen is not remembered either.
  const shallow = Object.freeze({ ...element('b') });
  const shallowTimeline = timelineOf(shallow);
  const first = spatialTimelineDigest(shallowTimeline);
  (shallow.props as { text: string }).text = 'edited';
  assert.notEqual(spatialTimelineDigest(shallowTimeline), first);
});
