import assert from 'node:assert/strict';
import test from 'node:test';
import type { TimelineElement } from '../../components/studio/timeline/types';
import { assessVisualOverlap, elementRectAt } from './visual-overlap';

const shape = (id: string, start: number, props: Record<string, unknown>) => ({ id, type: 'shape', lane_key: id, timeline_start: start, duration: 3,
  props: { shape_kind: 'path', shape_width: 0.4, shape_height: 0.3, shape_fill: null, shape_stroke: '#ffffff', shape_stroke_width: 6, shape_taper: 0.4,
    shape_contours: [{ closed: false, points: [{ x: -0.5, y: 0, out: [0.2, -0.3] }, { x: 0.5, y: 0.1, in: [-0.1, 0.2] }] }],
    keyframes: { shape_draw: [{ t: 0, v: 0 }, { t: 1.5, v: 1 }], media_rotation: [{ t: 0, v: -10 }, { t: 3, v: 10 }] }, ...props } }) as unknown as TimelineElement;
const scene = (offset = 0) => [
  shape('a', 0, { media_offset_x: -0.1 }), shape('b', 0.5, { media_offset_x: offset }), shape('c', 1, { media_offset_y: 0.05 }),
  { id: 'cap', type: 'caption_text', lane_key: 'cap', timeline_start: 0, duration: 4,
    props: { text: 'Hello there', absX: 0.5, absY: 0.5, maxWidth: 0.4, fontSizePx: 60, animationIn: 'none', animationOut: 'none' } } as unknown as TimelineElement,
];
const run = (elements: TimelineElement[]) => assessVisualOverlap({ elements, lane_order: ['a', 'b', 'c', 'cap'], canvas: { width: 1080, height: 1920 },
  safe_area: { x: 100, y: 200, width: 880, height: 1500 } });

test('each pair reads the same actor boxes the uncached single-element path gives', () => {
  const elements = scene();
  const result = run(elements);
  assert.ok(result.warnings.length > 0);
  for (const warning of result.warnings) {
    warning.element_ids.forEach((id, i) => {
      const element = elements.find((e) => e.id === id)!;
      assert.deepEqual(warning.boxes[i], elementRectAt(element, warning.representative_at_seconds, elements, { width: 1080, height: 1920 }));
    });
  }
  assert.equal(JSON.stringify(run(elements)), JSON.stringify(result), 'a second assessment of the same timeline is identical');
});

test('an assessment after a shape moves measures the moved shape, not the earlier geometry', () => {
  const before = run(scene());
  const movedElements = scene(0.6);
  const moved = run(movedElements);
  assert.notEqual(JSON.stringify(moved), JSON.stringify(before));
  const b = movedElements.find((e) => e.id === 'b')!;
  for (const warning of moved.warnings.filter((w) => w.element_ids.includes('b'))) {
    assert.deepEqual(warning.boxes[warning.element_ids.indexOf('b')], elementRectAt(b, warning.representative_at_seconds, movedElements, { width: 1080, height: 1920 }));
  }
  const safe = moved.safe_area_warnings.find((w) => w.element_id === 'b');
  if (safe) assert.deepEqual(safe.box, elementRectAt(b, safe.representative_at_seconds, movedElements, { width: 1080, height: 1920 }));
});
