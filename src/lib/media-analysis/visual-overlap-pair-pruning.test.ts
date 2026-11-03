import assert from 'node:assert/strict';
import test from 'node:test';
import type { TimelineElement } from '../../components/studio/timeline/types';
import { resolveAnimationProps } from '../timeline/animation-presets';
import { readKeyframeMap } from '../timeline/keyframes';
import { assessVisualOverlap, scopedPairTimes, timeOverlapPartners } from './visual-overlap';

const TOUCHING_SECONDS = 1e-6;
const at = (id: string, timeline_start: number, duration: number) => ({ id, timeline_start, duration }) as unknown as TimelineElement;
/** The pairs the overlap check keeps, as a scan of every pair finds them. */
const keptPairs = (actors: TimelineElement[]) => {
  const pairs: string[] = [];
  for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) {
    const a = actors[i]!, b = actors[j]!;
    const start = Math.max(a.timeline_start, b.timeline_start), end = Math.min(a.timeline_start + a.duration, b.timeline_start + b.duration);
    if (!(end - start < TOUCHING_SECONDS)) pairs.push(`${i}|${j}`);
  }
  return pairs;
};
const partnerPairs = (actors: TimelineElement[]) => timeOverlapPartners(actors).flatMap((list, i) => {
  assert.deepEqual(list, [...list].sort((x, y) => x - y), 'partners are ascending');
  assert.ok(list.every(j => j > i), 'partners are later actors');
  return list.map(j => `${i}|${j}`);
});

test('the sweep keeps every pair the check keeps, in scan order', () => {
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let round = 0; round < 40; round++) {
    const actors = Array.from({ length: 60 }, (_, i) => at(`e${i}`, Math.round(random() * 400) / 20, Math.round(random() * 60) / 20));
    const kept = keptPairs(actors), swept = new Set(partnerPairs(actors));
    for (const pair of kept) assert.ok(swept.has(pair), `pair ${pair} was dropped`);
  }
});

test('pruning keeps a long clip with a late caption, back-to-back float slivers and odd times', () => {
  const actors = [
    at('long', 0, 100),                          // spans everything after many short ones end
    ...Array.from({ length: 20 }, (_, i) => at(`w${i}`, i * 0.5, 0.5)), // back to back: touching only
    at('late', 99.5, 2),                         // overlaps only the long clip
    at('sliver', 10, 0.3), at('sliver2', 10.3 - 1e-9, 1), // a float sliver shorter than touching
    at('nan', Number.NaN, 1), at('inf', 5, Number.POSITIVE_INFINITY), at('neg-inf', Number.NEGATIVE_INFINITY, 1),
    at('neg-inf2', Number.NEGATIVE_INFINITY, 2), at('zero', 3, 0), at('negative', 4, -1),
  ];
  const kept = keptPairs(actors), swept = new Set(partnerPairs(actors));
  for (const pair of kept) assert.ok(swept.has(pair), `pair ${pair} was dropped`);
  const index = (id: string) => actors.findIndex(e => e.id === id);
  assert.ok(swept.has(`${index('long')}|${index('late')}`));
  // A NaN or infinite actor is decided by the check's own arithmetic: two -Infinity starts are kept by it.
  assert.ok(kept.includes(`${index('neg-inf')}|${index('neg-inf2')}`) && swept.has(`${index('neg-inf')}|${index('neg-inf2')}`));
  assert.ok(swept.has(`${index("late")}|${index("nan")}`));
  // Actors that never share the screen are not visited.
  assert.ok(!swept.has(`${index('w0')}|${index('late')}`));
});

const caption = (id: string, start: number, duration: number, absY: number) => ({ id, type: 'caption_text', lane_key: 'cap', timeline_start: start, duration,
  props: { text: `Words ${id}`, absX: 0.5, absY, maxWidth: 0.5, fontSizePx: 64, animationIn: 'none', animationOut: 'none' } }) as unknown as TimelineElement;
const box = (id: string, start: number, duration: number) => ({ id, type: 'shape', lane_key: `lane-${id}`, timeline_start: start, duration,
  props: { shape_kind: 'rect', shape_width: 0.6, shape_height: 0.2, shape_fill: '#fff', media_offset_y: 0.4 } }) as unknown as TimelineElement;

test('a long graphic still warns against a caption that starts after many others ended', () => {
  const elements = [box('banner', 0, 60), ...Array.from({ length: 29 }, (_, i) => caption(`c${i}`, i * 2, 2, 0.1)), caption('late', 58, 2, 0.7)];
  const result = assessVisualOverlap({ elements, lane_order: ['lane-banner', 'cap'], canvas: { width: 1080, height: 1920 } });
  const pairs = result.warnings.map(w => w.element_ids.join('|'));
  assert.ok(pairs.includes('banner|late'), 'the late caption over the banner is reported');
  assert.equal(result.examined_relationships, 30, 'the banner with every caption; back-to-back captions only touch');
});

/** pairTimes and scopedPairTimes before the finite fast path, verbatim. */
const round = (value: number) => Number(value.toFixed(6));
function referencePairTimes(a: TimelineElement, b: TimelineElement, start: number, end: number) {
  const boundaries = new Set<number>([start, end]);
  for (const e of [a, b]) {
    const animation = resolveAnimationProps(e.props);
    for (const local of [animation.animationInDuration, e.duration - animation.animationOutDuration]) {
      const t = e.timeline_start + local;
      if (t > start && t < end) boundaries.add(t);
    }
    for (const points of Object.values(readKeyframeMap(e.props))) for (const point of points) {
      const t = e.timeline_start + point.t;
      if (t > start && t < end) boundaries.add(t);
    }
  }
  const sorted = [...boundaries].sort((x, y) => x - y);
  return [...new Set(sorted.flatMap((t, i) => i + 1 < sorted.length ? [t, (t + sorted[i + 1]!) / 2] : []).map(round))];
}
const referenceScoped = (a: TimelineElement, b: TimelineElement, start: number, end: number) =>
  [...new Set(end > start ? referencePairTimes(a, b, start, end) : [])].sort((x, y) => x - y);

test('pair sample times match the set-based version, duplicates, -0 and sub-microsecond gaps included', () => {
  const keyed = (id: string, start: number, duration: number, times: number[], extra: Record<string, unknown> = {}) => ({ id, timeline_start: start, duration,
    props: { animationIn: 'fade', animationInDuration: 0.25, animationOut: 'fade', animationOutDuration: 0.25, keyframes: { media_scale: times.map(t => ({ t, v: 1 })) }, ...extra } }) as unknown as TimelineElement;
  const cases: Array<[TimelineElement, TimelineElement, number, number]> = [];
  const a = keyed('a', -0.0000004, 2, [0, 0.0000004, 0.0000009, 0.5, 0.5, 1.9999999]);
  const b = keyed('b', 0.0000001, 2, [0, 0.25, 0.2500000001, 0.75, 1.5]);
  cases.push([a, b, 0.0000001, 1.9999996], [a, a, -0.0000004, 1.9999996], [b, b, 0.0000001, 2.0000001]);
  const c = keyed('c', 3, 1e-7, [0, 5e-8], { animationInDuration: 0, animationOutDuration: 0 });
  cases.push([c, c, 3, 3 + 1e-7], [keyed('d', 1e6, 0.5, [0.1]), keyed('e', 1e6 + 0.2, 1, [0.3]), 1e6 + 0.2, 1e6 + 0.5]);
  let seed = 11;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let i = 0; i < 300; i++) {
    const x = keyed('x', random() * 10 - 5, random() * 3, Array.from({ length: 4 }, () => Math.round(random() * 3e7) / 1e7));
    const y = keyed('y', x.timeline_start + random() * 2 - 1, random() * 3, Array.from({ length: 3 }, () => random() * 3));
    cases.push([x, y, Math.max(x.timeline_start, y.timeline_start), Math.min(x.timeline_start + x.duration, y.timeline_start + y.duration)]);
  }
  for (const [x, y, start, end] of cases) {
    assert.deepEqual(scopedPairTimes(x, y, start, end), referenceScoped(x, y, start, end));
    assert.deepEqual(scopedPairTimes(x, y, start, end, undefined, new Map()), referenceScoped(x, y, start, end), 'with a boundary cache');
    assert.ok(Object.is(scopedPairTimes(x, y, start, end)[0], referenceScoped(x, y, start, end)[0]), 'the same signed zero is kept');
  }
});

test('each element and reason is listed once, in first-seen order, however many pairs repeat it', () => {
  const elements = [...Array.from({ length: 12 }, (_, i) => caption(`c${i}`, 0, 5, 0.1 + i * 0.05)), box('banner', 0, 5)];
  const result = assessVisualOverlap({ elements, lane_order: ['lane-banner', 'cap'], canvas: { width: 1080, height: 1920 } });
  assert.deepEqual(result.unknowns.map(u => u.element_id), elements.filter(e => e.type === 'caption_text').map(e => e.id));
  assert.equal(new Set(result.unknowns.map(u => `${u.element_id}|${u.reason}`)).size, result.unknowns.length);
});

test('a background role is read per assessment: every sample suppressed, and a later edit is seen', () => {
  const plate = { ...box('plate', 0, 10), lane_key: 'lane-plate' } as TimelineElement;
  const elements = [plate, ...Array.from({ length: 5 }, (_, i) => caption(`c${i}`, i * 2, 2, 0.7))];
  const input = { elements, lane_order: ['cap', 'lane-plate'], canvas: { width: 1080, height: 1920 }, safe_area: { x: 2000, y: 0, width: 10, height: 10 } };
  const asForeground = assessVisualOverlap(input);
  assert.equal(asForeground.warnings.length, 5);
  plate.props = { ...plate.props, visual_role: 'background' };
  const asBackground = assessVisualOverlap(input);
  assert.equal(asBackground.warnings.length, 0);
  assert.equal(asBackground.suppressed_expected_overlaps, asForeground.observed_intersections);
  assert.ok(!asBackground.safe_area_warnings.some(w => w.element_id === 'plate'), 'a background is not checked against the safe area');
  assert.ok(asForeground.safe_area_warnings.some(w => w.element_id === 'plate'));
});
