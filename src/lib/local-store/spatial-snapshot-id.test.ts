import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createProject, readTimeline, writeTimeline, type TimelineFile } from './store';
import { assessProjectSpatial, spatialTimelineDigest } from './spatial-assessment';
import type { TimelineElement } from '../../components/studio/timeline/types';

const element = (id: string, extra: Partial<TimelineElement> = {}) => ({ id, project_id: 'fixture', type: 'caption_text', lane_key: 'captions_0',
  timeline_start: 0, duration: 1, playback_rate: 1, source_url: null, props: { text: id, style: { size: 40, words: [{ t: 0, w: 'a' }] } }, ...extra }) as TimelineElement;
const timelineOf = (...elements: TimelineElement[]) => ({ elements, transitions: [] }) as unknown as TimelineFile;

test('the timeline digest changes with any element, the element order or the other timeline fields', () => {
  const a = element('a'), b = element('b');
  const base = spatialTimelineDigest(timelineOf(a, b));
  assert.equal(spatialTimelineDigest(structuredClone(timelineOf(a, b))), base, 'equal content in a new object keeps the id');
  const changed = [
    timelineOf(b, a),
    timelineOf(a),
    timelineOf(a, b, element('c')),
    timelineOf(a, { ...b, timeline_start: 0.5 }),
    timelineOf(a, { ...b, props: { ...b.props, style: { size: 40, words: [{ t: 0, w: 'b' }] } } }),
    timelineOf(a, { ...b, removed_at: '2026-10-25T00:00:00.000Z' } as TimelineElement),
    { ...timelineOf(a, b), transitions: [{ id: 't' }] } as unknown as TimelineFile,
    // Content moved across an element boundary still changes the text.
    timelineOf({ ...a, props: { text: 'ab' } } as TimelineElement, { ...b, props: { text: '' } } as TimelineElement),
  ];
  const digests = new Set([base, ...changed.map(spatialTimelineDigest)]);
  assert.equal(digests.size, changed.length + 1);
});

test('the digest reads the object as it is now: an in-place edit is never answered from an earlier call', () => {
  const timeline = timelineOf(element('a'), element('b'));
  const before = spatialTimelineDigest(timeline);
  (timeline.elements[1]!.props as { style: { words: Array<{ w: string }> } }).style.words[0]!.w = 'edited';
  const after = spatialTimelineDigest(timeline);
  assert.notEqual(after, before);
  timeline.elements.reverse();
  assert.notEqual(spatialTimelineDigest(timeline), after);
  assert.equal(JSON.stringify(timeline.elements.map(e => e.id)), '["b","a"]', 'the digest does not change its input');
});

test('snapshot_id changes with the timeline, lane order and output format, and repeats for the same inputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spatial-snapshot-id-test-'));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject('fixture', 'web');
    writeTimeline('fixture', timelineOf(element('a'), element('b', { lane_key: 'captions_1' })), 'fixture');
    const timeline = readTimeline('fixture');
    const id = (t: TimelineFile, lanes?: string[], output?: Parameters<typeof assessProjectSpatial>[3]) => assessProjectSpatial('fixture', t, lanes, output).snapshot_id;
    const base = id(timeline);
    assert.equal(id(readTimeline('fixture')), base, 'a fresh read of the same file keeps the id');
    const ids = [
      base,
      id({ ...timeline, elements: timeline.elements.map(e => e.id === 'a' ? { ...e, duration: 2 } : e) }),
      id(timeline, ['captions_1', 'captions_0']),
      id(timeline, ['captions_0', 'captions_1']),
      id(timeline, undefined, { aspect_ratio: '9:16' }),
      id(timeline, undefined, { aspect_ratio: '1:1' }),
      id(timeline, undefined, { delivery_target: 'reels' }),
    ];
    assert.equal(new Set(ids).size, ids.length);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
