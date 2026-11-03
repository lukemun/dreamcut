import test from 'node:test';
import assert from 'node:assert/strict';
import { PREVIEW_PROXY_CONTRACT } from '@/lib/remotion/preview-proxy-contract';
import { overflowHoldCaptureKey, pendingOverflowHoldCaptures } from './capture-preview-hold';
import { thumbnailWorkKey, visibleThumbnailElements } from './timeline-thumbnail-work';
import type { TimelineElement } from './types';

const preview = '/api/projects/p/media/.prepared/editor-media-v1/a/b/preview.mp4';
const clip = (over: Partial<TimelineElement> = {}, props: Record<string, unknown> = {}) => ({
  id: 'v1', type: 'video_clip', lane_key: 'visual', timeline_start: 0, duration: 6, trim_start: 1, trim_end: null, playback_rate: 1,
  source_url: '/api/projects/p/media/sources/take.mov', _source_duration: 4,
  props: { preview_source_url: preview, preview_proxy_validation: { contract: PREVIEW_PROXY_CONTRACT, url: preview, ok: true, width: 640, height: 360 }, ...props },
  ...over,
}) as unknown as TimelineElement;

test('thumbnail work ignores a new elements array that changes nothing it would fetch', () => {
  const before = [clip(), { ...clip({ id: 't1', type: 'text', source_url: undefined }) }];
  const after = before.map(element => ({ ...element, _peaks: [0.1, 0.2], props: { ...element.props, runtime_note: 1 } })) as TimelineElement[];
  assert.equal(thumbnailWorkKey(after), thumbnailWorkKey(before));
  assert.ok(!thumbnailWorkKey(before).includes('t1'));
});

test('thumbnail work restarts when a visible clip trim, source or position changes', () => {
  const base = thumbnailWorkKey([clip()]);
  assert.notEqual(thumbnailWorkKey([clip({ trim_start: 2 })]), base);
  assert.notEqual(thumbnailWorkKey([clip({ timeline_start: 1 })]), base);
  assert.notEqual(thumbnailWorkKey([clip({ type: 'still', source_url: '/still.png' } as Partial<TimelineElement>)]), base);
});

test('only clips overlapping the viewport get thumbnails', () => {
  const near = clip({ id: 'a', timeline_start: 0, duration: 5 }), far = clip({ id: 'b', timeline_start: 30, duration: 5 }), gone = clip({ id: 'c', removed_at: 'x' } as Partial<TimelineElement>);
  assert.deepEqual(visibleThumbnailElements([near, far, gone], 0, 12).map(element => element.id), ['a']);
});

test('hold captures list only missing frames from a validated preview, with stable keys', () => {
  const jobs = pendingOverflowHoldCaptures([clip()], {}, {}, 30);
  assert.deepEqual(jobs.map(job => [job.edge, job.source]), [['end', preview]]);
  const again = pendingOverflowHoldCaptures([{ ...clip(), _peaks: [1] } as TimelineElement], {}, {}, 30);
  assert.equal(again.map(overflowHoldCaptureKey).join(), jobs.map(overflowHoldCaptureKey).join());
  assert.deepEqual(pendingOverflowHoldCaptures([clip()], {}, { v1: 'data:image/png;base64,x' }, 30), []);
  assert.deepEqual(pendingOverflowHoldCaptures([clip({}, { preview_proxy_validation: undefined })], {}, {}, 30), []);
});
