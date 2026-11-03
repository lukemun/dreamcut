import assert from 'node:assert/strict';
import test from 'node:test';
import type { TimelineElement } from '../../components/studio/timeline/types';
import { mediaSceneHolds, resolveMediaScene } from '../timeline/resolved-media-scene';
import { assessVisualOverlap, elementRectAt } from './visual-overlap';

const canvas = { width: 1080, height: 1920 };
const geometry = (props: Record<string, unknown>, time: number) => {
  const { capabilities: _c, grade: _g, ...rest } = resolveMediaScene(props, time, canvas);
  return JSON.stringify(rest);
};

test('a scene is the same at every time of a stretch its hold key names', () => {
  const cases: Array<Record<string, unknown>> = [
    {},
    { media_scale: 1.2, media_offset_x: 0.1 },
    // One value at every point resolves to it everywhere, whatever the ease.
    { keyframes: { media_scale: [{ t: 0, v: 0.32, ease: 'hold' }, { t: 1.033, v: 0.32 }], mask_inset: [{ t: 0, v: [0.1, 0, 0, 0.2] }, { t: 3, v: [0.1, 0, 0, 0.2] }] } },
    // A punch-in from 1 s to 2 s, with a constant field beside it.
    { keyframes: { media_scale: [{ t: 1, v: 1 }, { t: 2, v: 1.6, ease: 'easeInOut' }], media_offset_y: [{ t: 0, v: 0.2 }, { t: 4, v: 0.2 }] } },
    { keyframes: { transition_blur: [{ t: 0.5, v: 0 }, { t: 0.9, v: 0 }, { t: 1.2, v: 8 }], media_opacity: [{ t: 0.4, v: 1 }, { t: 1.4, v: 0.5 }] } },
    { keyframes: { media_offset_x: [{ t: 0, v: -0 }, { t: 2, v: 0 }] } },
  ];
  const times = Array.from({ length: 81 }, (_, i) => i * 0.05);
  for (const props of cases) {
    const holdAt = mediaSceneHolds(props);
    const byKey = new Map<string, string>();
    for (const time of times) {
      const key = holdAt(time);
      if (!key) continue;
      const scene = geometry(props, time);
      if (!byKey.has(key)) byKey.set(key, scene);
      assert.equal(scene, byKey.get(key), `${JSON.stringify(props)} at ${time}s (${key})`);
    }
  }
  const punch = mediaSceneHolds(cases[3]!);
  assert.deepEqual([0, 0.998, 1, 1.5, 2, 2.002, 3].map(punch), ['before', 'before', null, null, null, 'after', 'after']);
  assert.equal(mediaSceneHolds(cases[2]!)(0.5), 'always');
});

test('a window opening or a source canvas track never shares a scene between times', () => {
  assert.equal(mediaSceneHolds({ window_open_duration: 1 })(3), null);
  assert.equal(mediaSceneHolds({ source_canvas_track: { samples: [] } })(3), null);
  assert.equal(mediaSceneHolds({ window_open_duration: 0 })(3), 'always');
});

const clip = (props: Record<string, unknown>) => ({ id: 'v', type: 'video_clip', lane_key: 'v', timeline_start: 1, duration: 4, trim_start: 0, playback_rate: 1,
  source_url: '/api/projects/p/media/v.mp4', props: { source_width: 1920, source_height: 1080, ...props } }) as unknown as TimelineElement;
const caption = (id: string, start: number) => ({ id, type: 'caption_text', lane_key: 'cap', timeline_start: start, duration: 0.4,
  props: { text: 'Words here', absX: 0.5, absY: 0.5, maxWidth: 0.5, fontSizePx: 90, animationIn: 'none', animationOut: 'none' } }) as unknown as TimelineElement;
const scene = (props: Record<string, unknown>) => [clip(props), ...Array.from({ length: 9 }, (_, i) => caption(`c${i}`, 1 + i * 0.45))];
const run = (elements: TimelineElement[]) => assessVisualOverlap({ elements, lane_order: ['cap', 'v'], canvas,
  safe_area: { x: 300, y: 600, width: 480, height: 700 } });
const punchIn = { keyframes: { media_scale: [{ t: 1, v: 0.5 }, { t: 2, v: 0.8 }], media_offset_x: [{ t: 0, v: 0.1, ease: 'hold' }, { t: 4, v: 0.1 }] },
  animationIn: 'slide_up', animationInDuration: 0.3 };

test('clip boxes from shared scenes match the uncached single-element path at every reported time', () => {
  for (const props of [{}, punchIn, { media_scale: 0.6 }]) {
    const elements = scene(props);
    const result = run(elements);
    assert.ok(result.warnings.length > 0 || result.safe_area_warnings.length > 0, JSON.stringify(props));
    const v = elements[0]!;
    for (const warning of result.warnings) {
      const i = warning.element_ids.indexOf('v');
      if (i >= 0) assert.deepEqual(warning.boxes[i], elementRectAt(v, warning.representative_at_seconds, elements, canvas));
    }
    for (const warning of result.safe_area_warnings) {
      const element = elements.find(e => e.id === warning.element_id)!;
      assert.deepEqual(warning.box, elementRectAt(element, warning.representative_at_seconds, elements, canvas));
    }
  }
});

test('an assessment after a clip changes in place reads the change, not the previous scene or boundaries', () => {
  const elements = scene({ media_scale: 0.6 });
  const first = JSON.stringify(run(elements));
  assert.equal(JSON.stringify(run(elements)), first);
  // Same objects, new geometry and new keyframe times: each assessment builds its caches afresh.
  Object.assign(elements[0]!.props!, punchIn);
  const changed = JSON.stringify(run(elements));
  assert.notEqual(changed, first);
  assert.equal(changed, JSON.stringify(run(structuredClone(elements))));
});
