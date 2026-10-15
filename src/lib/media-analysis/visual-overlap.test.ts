import assert from 'node:assert/strict';
import test from 'node:test';
import type { TimelineElement } from '../../components/studio/timeline/types';
import { assessVisualOverlap } from './visual-overlap';
import { assessSpatialComposition } from './spatial-assessment';
import { analyzeAlphaRgbaFrame, type AlphaFootprintArtifact } from './alpha-footprint';

const element = (id: string, type: TimelineElement['type'], props = {}) => ({ id, type, lane_key: id, timeline_start: 0, duration: 2,
  props: { source_width: 1000, source_height: 1000, media_scale: 0.2, ...props } }) as TimelineElement;
const input = (elements: TimelineElement[]) => ({ elements, lane_order: ['a','b'], canvas: { width: 1000, height: 1000 } });
const caption = (id: string) => element(id, 'caption_text', { text: 'Hello', absX: 0.5, absY: 0.5,
  maxWidth: 0.2, fontSizePx: 50, animationIn: 'none', animationOut: 'none' });

test('delivery action rail applies only below its start and propagates through spatial assessment', () => {
  const make = (y: number) => ({ ...element('a', 'still', { media_offset_x: 0.6, media_offset_y: y }), source_url: '/image.png' });
  const base = { ...input([make(0)]), safe_area: { x: 50, y: 50, width: 900, height: 900 },
    safe_area_rail: { top: 500, right_edge: 750 } };
  assert.equal(assessVisualOverlap(base).safe_area_warnings[0]?.outside_pixels.right, 150);
  assert.equal(assessVisualOverlap({ ...base, elements: [make(-0.4)] }).safe_area_warnings.length, 0);
  assert.equal(assessVisualOverlap({ ...base, safe_area_rail: undefined }).safe_area_warnings.length, 0);
  const composed = assessSpatialComposition({ ...base, sources: {}, snapshot_id: 'rail-fixture' });
  assert.equal(composed.visual_overlap.safe_area_warnings[0]?.outside_pixels.right, 150);
  assert.deepEqual(composed.visual_overlap.safe_area_warnings[0]?.safe_rail, base.safe_area_rail);
});
const alphaEvidence=(points:Array<[number,number]>)=>{
  const bytes=Buffer.alloc(2*2*4); for(const [x,y] of points) bytes[(y*2+x)*4+3]=255;
  const artifact:AlphaFootprintArtifact={schema_version:1,recipe_version:'binary-alpha-footprint-v1',source_fingerprint_sha256:'a'.repeat(64),
    width:2,height:2,alpha_threshold:1,frame_rate:null,duration_seconds:null,frames:[analyzeAlphaRgbaFrame(bytes,2,2,0)]};
  return {revision_id:points.join('-'),artifact};
};

test('all media combinations use the shared overlap engine, including alpha video', () => {
  for (const types of [['still','video_clip'], ['video_clip','video_clip'], ['video_clip','still']] as const) {
    const r = assessVisualOverlap(input([element('a', types[0], { has_alpha: true }), element('b', types[1])]));
    assert.equal(r.status, 'sampled');
    assert.deepEqual(r.warnings[0]?.element_types, types);
    assert.equal(r.warnings[0]?.front_element_id, 'a');
    assert.equal(r.warnings[0]?.code, 'possible_visual_overlap');
  }
});
test('caption-media and caption-caption pairs expose estimates honestly', () => {
  for (const b of [element('b','video_clip'), element('b','still'), caption('b')]) {
    const r = assessVisualOverlap(input([caption('a'),b]));
    assert.ok(r.warnings.length);
    assert.ok(r.unknowns.some(u => u.reason.includes('estimated')));
  }
});
test('loaded-font caption heights affect the assessed footprint', () => {
  const r = assessVisualOverlap({ ...input([caption('a'), element('b','video_clip')]),
    measurements: { a: { width: 200, height: 91, lines: 2, loadedFamily: 'font', inkWidth: 130 } } });
  assert.equal(r.status, 'sampled');
  assert.equal(r.warnings[0]?.boxes[0].height, 91);
  assert.equal(r.warnings[0]?.footprints[0].basis, 'measured_caption_rectangle');
});
test('warnings expose conservative centroids, outlines and contact geometry', () => {
  const r = assessVisualOverlap(input([element('a','still'), element('b','video_clip')]));
  const warning = r.warnings[0]!;
  assert.deepEqual(warning.footprints[0].centroid, { x: 500, y: 500 });
  assert.equal(warning.footprints[0].visible_shape, 'unknown');
  assert.deepEqual(warning.footprints[0].outline.points, [
    { x: 400, y: 400 }, { x: 600, y: 400 }, { x: 600, y: 600 }, { x: 400, y: 600 },
  ]);
  assert.deepEqual(warning.contact.centroid, { x: 500, y: 500 });
  assert.equal(warning.contact.area, 40_000);
  assert.equal(warning.contact.fraction_of_first, 1);
  assert.equal(warning.contact.fraction_of_second, 1);
});
test('decoded alpha suppresses transparent rectangle collisions and reports exact pixel contact',()=>{
  const elements=[element('a','still'),element('b','still')];
  const disjoint=assessVisualOverlap({...input(elements),alpha_footprints:{a:alphaEvidence([[0,0],[1,1]]),b:alphaEvidence([[1,0],[0,1]])}});
  assert.equal(disjoint.warnings.length,0);
  assert.ok(disjoint.suppressed_transparent_overlaps>0);
  const exact=assessVisualOverlap({...input(elements),alpha_footprints:{a:alphaEvidence([[0,0],[1,1]]),b:alphaEvidence([[0,0],[1,1]])}});
  assert.equal(exact.warnings[0]?.footprints[0].visible_shape,'binary_alpha');
  assert.equal(exact.warnings[0]?.contact.kind,'pixel_overlap');
  assert.ok((exact.warnings[0]?.contact.overlap_pixels??0)>0);
});
test('unsupported captions report unknown; audio, muted and removed media are excluded', () => {
  const a = caption('a'); a.props = { ...a.props, animationIn: 'slide_up' };
  const r = assessVisualOverlap(input([a, element('b','video_clip')]));
  assert.equal(r.status, 'unknown');
  assert.equal(r.warnings.length, 0);
  assert.equal(assessVisualOverlap(input([element('a','music'),element('b','video_clip')])).status, 'not_applicable');
  assert.equal(assessVisualOverlap({ ...input([element('a','video_clip'),element('b','still')]), hidden_lanes: ['a'] }).status, 'not_applicable');
  assert.equal(assessVisualOverlap(input([{ ...element('a','video_clip'), removed_at: 'now' },element('b','still')])).status, 'not_applicable');
});
test('API assessment includes visual pairs under the visual overlap contract', () => {
  const r = assessSpatialComposition({ ...input([element('a','video_clip'),element('b','still')]), sources: {}, snapshot_id: 's' });
  assert.ok(r.visual_overlap.warnings.length);
});
test('one pair becomes one interval warning and unrelated boundaries do not duplicate it', () => {
  const long = { ...element('a','still'), duration: 20 };
  const peer = { ...element('b','video_clip'), duration: 20 };
  const unrelated = { ...element('c','still',{ media_offset_x: 0.8 }), timeline_start: 1, duration: 0.5, lane_key: 'c' };
  const r = assessVisualOverlap({ elements: [long,peer,unrelated], lane_order: ['a','b','c'], canvas: { width:1000,height:1000 } });
  assert.equal(r.warnings.filter(w => w.element_ids.includes('a') && w.element_ids.includes('b')).length, 1);
  assert.equal(r.examined_relationships, 3);
});
test('full-frame actors behind foreground and explicit backgrounds are expected overlaps', () => {
  const foreground = element('a','still',{ media_scale: 0.2 });
  const fullFrame = element('b','video_clip',{ media_scale: 1 });
  const explicit = element('c','still',{ media_scale: 0.5, title: 'Black background' });
  const r = assessVisualOverlap({ elements:[foreground,fullFrame,explicit], lane_order:['a','b','c'], canvas:{width:1000,height:1000} });
  assert.equal(r.warnings.length, 0);
  assert.ok(r.suppressed_expected_overlaps > 0);
});
test('minor intersections remain measurements without becoming warnings', () => {
  const r = assessVisualOverlap(input([element('a','still',{ media_offset_x:-0.19 }),element('b','still',{ media_offset_x:0.19 })]));
  assert.equal(r.warnings.length,0);
  assert.ok(r.suppressed_minor_overlaps > 0);
});

test('safe-area warnings report sampled foreground actors beyond the delivery-safe rectangle', () => {
  const actor = element('a', 'still', { media_scale: 0.4, media_offset_x: -0.8 });
  const r = assessVisualOverlap({
    ...input([actor]),
    safe_area: { x: 50, y: 50, width: 900, height: 900 },
  });
  assert.equal(r.safe_area_warnings[0]?.code, 'visual_outside_safe_area');
  assert.equal(r.safe_area_warnings[0]?.element_id, 'a');
  assert.ok((r.safe_area_warnings[0]?.outside_pixels.left ?? 0) > 0);
  assert.ok(r.examined_safe_area_samples > 0);
});

test('the bounded pair budget covers ordinary late-timeline relationships', () => {
  const elements = Array.from({ length: 90 }, (_, index) => ({
    ...element(`e${index}`, 'still', { media_scale: 0.1 }),
    lane_key: `e${index}`,
    timeline_start: index,
    duration: 2,
  }));
  const r = assessVisualOverlap({ elements, lane_order: elements.map((entry) => entry.lane_key), canvas: { width: 1000, height: 1000 } });
  assert.equal(r.truncated, false);
  assert.ok(r.warnings.some((warning) => warning.start_seconds >= 88));
});

test('proposal scope excludes unrelated warnings outside changed actors and intervals', () => {
  const earlyA = { ...element('a', 'still'), timeline_start: 0, duration: 2 };
  const earlyB = { ...element('b', 'still'), timeline_start: 0, duration: 2 };
  const changed = { ...element('c', 'still'), timeline_start: 10, duration: 2, lane_key: 'c' };
  const nearby = { ...element('d', 'video_clip'), timeline_start: 10, duration: 2, lane_key: 'd' };
  const r = assessVisualOverlap({
    elements: [earlyA, earlyB, changed, nearby],
    lane_order: ['a', 'b', 'c', 'd'],
    canvas: { width: 1000, height: 1000 },
    safe_area: { x: 50, y: 50, width: 900, height: 900 },
    scope: { time_ranges: [{ start_seconds: 10, end_seconds: 12 }], focus_element_ids: ['c'] },
  });
  assert.deepEqual(r.warnings.map((warning) => warning.element_ids), [['c', 'd']]);
  assert.equal(r.examined_relationships, 1);
  assert.ok(r.safe_area_warnings.every((warning) => warning.element_id === 'c'));
});

test('back-to-back clips that share only a float sliver are touching, not overlapping', () => {
  // A frame-snapped start (1895/30) against start + duration (1727/30 + 5.6) differs by ~1e-14 s.
  const first = { ...element('a', 'video_clip'), source_url: '/a.mp4', timeline_start: 1727 / 30, duration: 5.6 } as TimelineElement;
  const second = { ...element('b', 'video_clip'), source_url: '/b.mp4', timeline_start: 1895 / 30, duration: 4 } as TimelineElement;
  assert.ok(first.timeline_start + first.duration > second.timeline_start, 'fixture reproduces the float sliver');
  assert.equal(assessVisualOverlap(input([first, second])).warnings.length, 0);
  const real = { ...second, timeline_start: second.timeline_start - 0.5 } as TimelineElement;
  assert.equal(assessVisualOverlap(input([first, real])).warnings[0]?.code, 'possible_visual_overlap');
});
