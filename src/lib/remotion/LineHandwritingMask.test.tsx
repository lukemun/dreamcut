import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HandwritingText } from './HandwritingText';
import { resolveCaptionProps } from '../timeline/captions';
import { lineMaskGuide } from './LineHandwritingMask';
import guides from '../timeline/handwriting/experiments/pacifico-line-mask/guides.json';
import { LINE_HANDWRITING_PACKS } from '../timeline/handwriting-packs-sync';
import { SHARED_FONT_LIBRARY } from '../fonts/registry';
import { PREPARED_HANDWRITING_FONTS, PREPARED_HANDWRITING_CHARACTERS, handwritingPackStatus } from '../timeline/handwriting-status';
import { layoutPreparedHandwriting, HANDWRITING_PEN_LIFT } from '../timeline/prepared-handwriting';

const props = { fontPreset: 'pacifico', text: 'A', progress: .5, fontSize: 200,
  maxWidth: 800, singleLine: true, align: 'center' as const, color: 'black' };
const render = (p: Partial<React.ComponentProps<typeof HandwritingText>> = {}) =>
  renderToStaticMarkup(<HandwritingText {...props} {...p} />);

test('selected line mask is the default while archived saved assets remain unchanged', () => {
  assert.equal(render(), render({ revealMode: 'line_mask' }));
  assert.doesNotMatch(render({ revealMode: 'saved_strokes' }), /data-line-mask/);
  assert.equal(resolveCaptionProps({}).handwritingRevealMode, 'line_mask');
  assert.equal(resolveCaptionProps({ handwritingRevealMode: 'unknown' }).handwritingRevealMode, 'line_mask');
  assert.equal(resolveCaptionProps({ handwritingRevealMode: 'line_mask' }).handwritingRevealMode, 'line_mask');
  const root = 'src/lib/timeline/handwriting/saved-reveal-v1/';
  const receipt = JSON.parse(fs.readFileSync(root + 'receipt.json', 'utf8'));
  const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(hash(root + 'PreparedHandwritingText.tsx.txt'), receipt.renderer_snapshot_sha256);
  assert.equal(hash(root + 'PermanentMarkerText.tsx.txt'), receipt.marker_renderer_snapshot_sha256);
  for (const [file, sha] of Object.entries(receipt.assets)) assert.equal(hash(file), sha, file);
});

test('all handwritten fonts and all 85 characters have a native continuous-mask route', () => {
  assert.deepEqual(Object.keys(LINE_HANDWRITING_PACKS).sort(), SHARED_FONT_LIBRARY.filter(f => f.category === 'Handwriting').map(f => f.id).sort());
  for (const [fontPreset, pack] of Object.entries(LINE_HANDWRITING_PACKS)) {
    assert.equal(Object.keys(pack.lineStrokes!).length, 85, fontPreset);
    for (const character of PREPARED_HANDWRITING_CHARACTERS) assert.ok(lineMaskGuide(fontPreset, character), `${fontPreset}: ${character}`);
    assert.match(render({ fontPreset }), /data-line-mask/);
    assert.match(render({ fontPreset, revealMode: 'saved_strokes' }), /mask=/);
    assert.equal(lineMaskGuide(fontPreset, 'é'), undefined);
    assert.match(handwritingPackStatus(fontPreset, 'é').label, /some characters appear whole/);
  }
  assert.doesNotMatch(render({ fontPreset: 'clean_sans' }), /data-line-mask/);
  assert.equal(handwritingPackStatus('clean_sans', 'A').kind, 'fallback');
});

test('vector nib follows cubic turns and keeps the source contour mask through completion', () => {
  const segments = guides.characters.A.segments;
  assert.equal(segments.length, 3);
  assert.ok(segments[1].width < segments[0].width, 'upstroke is narrower before descending');
  assert.ok(segments.every(s => s.d.includes('C') && s.length > 0));
  assert.doesNotMatch(render({ revealMode: 'line_mask', progress: 0 }), /data-line-mask/);
  for (const progress of [.1, .25, .5, .75, .999, 1, .5]) {
    const svg = render({ revealMode: 'line_mask', progress });
    assert.match(svg, /<mask /);
    assert.match(svg, /mask="url/);
    assert.match(svg, /stroke-dashoffset=/);
    assert.doesNotMatch(svg, /opacity="0\./, 'no fading raster bands');
  }
  assert.notEqual(render({ revealMode: 'line_mask', progress: .5 }), render({ revealMode: 'line_mask', progress: 1 }), 'the frame clock advances the mask');
});

test('the accepted Pacifico A trajectory and timing remain intact', () => {
  assert.deepEqual(lineMaskGuide('pacifico', 'A')!.segments, guides.characters.A.segments);
  const pack = LINE_HANDWRITING_PACKS.pacifico;
  assert.ok(Math.abs(layoutPreparedHandwriting(pack, 'A', Infinity, 'left', 'line_mask').duration - layoutPreparedHandwriting(pack, 'A').duration) < 1e-7);
  const root = 'src/lib/timeline/handwriting/experiments/pacifico-line-mask/';
  const audit = JSON.parse(fs.readFileSync(root + 'audit/coverage.json', 'utf8'));
  assert.equal(audit.reveal_mode, 'line_mask');
  assert.equal(audit.line_guides_sha256, createHash('sha256').update(JSON.stringify(guides)).digest('hex'));
  assert.ok(audit.characters[0].coverage_percent >= 99.5, 'A retains its source ink through completion');
  assert.ok(audit.characters[0].extra_ink_percent < .5, 'mask cannot paint beyond source contour');
});

for (const [fontId, pack] of Object.entries(LINE_HANDWRITING_PACKS)) {
  test(`${fontId}: current completion receipts cover every character and preserve pen lifts`, () => {
    const slug = fontId === 'permanent_marker' ? 'permanent-marker' : PREPARED_HANDWRITING_FONTS[fontId as keyof typeof PREPARED_HANDWRITING_FONTS].slug;
    const root = `src/lib/timeline/handwriting/fonts/${slug}/`;
    const audit = JSON.parse(fs.readFileSync(root + 'line-audit/coverage.json', 'utf8'));
    const hash = createHash('sha256').update(JSON.stringify(pack.lineStrokes)).digest('hex');
    assert.equal(audit.line_guides_sha256, hash, 'receipts must identify the actual new trajectories');
    const largeFile = root + 'line-audit/completion-check/coverage.json';
    const large = fs.existsSync(largeFile) ? JSON.parse(fs.readFileSync(largeFile, 'utf8')) : null;
    if (large) assert.equal(large.line_guides_sha256, hash);
    assert.equal(audit.characters.length, 85);
    for (const row of audit.characters) {
      const comparison = row.coverage_percent >= 99 ? row : large?.characters.find((r: { character: string }) => r.character === row.character);
      assert.ok(comparison?.coverage_percent >= 99, `${row.character}: original ink must remain complete`);
      assert.ok(comparison?.extra_ink_percent < 1, `${row.character}: ink must remain inside the source contour`);
      const glyph = layoutPreparedHandwriting(pack, row.character, Infinity, 'left', 'line_mask').glyphs[0];
      for (let i = 1; i < glyph.strokes.length; i++) assert.ok(Math.abs(glyph.strokes[i].start - glyph.strokes[i-1].start - glyph.strokes[i-1].length - HANDWRITING_PEN_LIFT) < 1e-7);
      const svg = render({ fontPreset: fontId, text: row.character, progress: .5 });
      assert.match(svg, /stroke-dashoffset=/);
      assert.doesNotMatch(svg, /opacity="0\./, 'continuous reveal must not use fading raster time bands');
      assert.match(render({ fontPreset: fontId, text: row.character, progress: 1 }), /<g mask="url/);
    }
  });
}

test('B starts with a descending stem, lifts, and defers the second gesture', () => {
  for (const [fontPreset, pack] of Object.entries(LINE_HANDWRITING_PACKS)) {
    const paths = pack.lineStrokes!.B;
    assert.equal(paths.length, 2, `${fontPreset}: stem and bowls must have separate clocks`);
    const points = paths[0].segments[0].d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    assert.ok(points.at(-1)! > points[1], `${fontPreset}: first gesture descends`);
    const layout = layoutPreparedHandwriting(pack, 'B', Infinity, 'left', 'line_mask');
    const stem = layout.glyphs[0].strokes[0];
    const duringLift = (stem.start + stem.length + HANDWRITING_PEN_LIFT / 2) / layout.duration;
    const svg = render({ fontPreset, text: 'B', progress: duringLift });
    assert.ok(svg.includes(`d="${paths[0].segments[0].d}"`), fontPreset);
    assert.ok(!svg.includes(`d="${paths[1].segments[0].d}"`), `${fontPreset}: no bowl nib during lift`);
  }
});

test('lowercase i keeps dot and stem separate without adding a dot to Permanent Marker', () => {
  for (const [fontPreset, pack] of Object.entries(LINE_HANDWRITING_PACKS)) {
    const paths = pack.lineStrokes!.i;
    if (fontPreset === 'permanent_marker') {
      assert.equal(paths.length, 1, 'actual small-cap i has no detached dot');
      continue;
    }
    assert.equal(paths.length, 2, fontPreset);
    const first = paths[0].segments[0].d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const next = paths[1].segments[0].d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    assert.ok(first[1] < next[1], `${fontPreset}: dot before stem`);
    const layout = layoutPreparedHandwriting(pack, 'i', Infinity, 'left', 'line_mask');
    const dot = layout.glyphs[0].strokes[0];
    const duringLift = (dot.start + dot.length + HANDWRITING_PEN_LIFT / 2) / layout.duration;
    assert.ok(!render({ fontPreset, text: 'i', progress: duringLift }).includes(`d="${paths[1].segments[0].d}"`), fontPreset);
  }
});

test('new review checklists remain bound to the assets and scoped acceptance', () => {
  for (const [fontId, pack] of Object.entries(LINE_HANDWRITING_PACKS)) {
    const slug = fontId === 'permanent_marker' ? 'permanent-marker' : PREPARED_HANDWRITING_FONTS[fontId as keyof typeof PREPARED_HANDWRITING_FONTS].slug;
    const root = `src/lib/timeline/handwriting/fonts/${slug}/`;
    const review = JSON.parse(fs.readFileSync(root + 'line-review.json', 'utf8'));
    assert.equal(review.line_guides_sha256, createHash('sha256').update(JSON.stringify(pack.lineStrokes)).digest('hex'));
    for (const [file, hash] of Object.entries(review.asset_hashes)) assert.equal(createHash('sha256').update(fs.readFileSync(root + file)).digest('hex'), hash, `${fontId}: ${file}`);
    for (const [file, hash] of Object.entries(review.evidence_hashes)) assert.equal(createHash('sha256').update(fs.readFileSync(root + file)).digest('hex'), hash, `${fontId}: ${file}`);
    const checklist = JSON.parse(fs.readFileSync(root + 'line-checklist.json', 'utf8'));
    assert.deepEqual(checklist.map((r: { character: string }) => r.character).sort(), [...PREPARED_HANDWRITING_CHARACTERS].sort());
    for (const row of checklist) {
      assert.ok(row.completion_coverage_percent >= 99);
      assert.equal(row.continuous_motion, 'pending');
      assert.equal(row.human_acceptance, fontId === 'pacifico' && row.character === 'A' ? 'shown_A_accepted' : 'pending');
    }
  }
});


test('extra handwriting weight preserves neutral output and thickens only revealed ink', () => {
  assert.equal(render(), render({ weight: 0 }));
  assert.match(render({ weight: 2 }), /feMorphology in="SourceGraphic" operator="dilate" radius="4"/);
  assert.equal(resolveCaptionProps({ handwritingWeight: 2 }).handwritingWeight, 2);
  assert.equal(resolveCaptionProps({ handwritingWeight: 9 }).handwritingWeight, 4);
  assert.equal(resolveCaptionProps({ handwritingWeight: NaN }).handwritingWeight, 0);
  assert.match(render({ weight: 2 }), /data-line-mask/);
});
