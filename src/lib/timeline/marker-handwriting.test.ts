import test from 'node:test';
import assert from 'node:assert/strict';
import outlines from './handwriting/fonts/permanent-marker/outlines.json';
import guides from './handwriting/fonts/permanent-marker/strokes.json';
import './handwriting-packs-sync';
import { layoutMarker, markerStrokeProgress, markerStrokeRegions } from './marker-handwriting';

test('Permanent Marker preserves glyph advances and spaces', () => {
 const p=layoutMarker('B u');
 assert.equal(p.glyphs[1].x-p.glyphs[0].x, outlines.B.advance+379);
 assert.equal(p.glyphs.map(g=>g.char).join(''),'Bu');
});
test('every prepared marker letter has finite ordered pen trajectories', () => {
 for(const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
  const g=layoutMarker(c).glyphs[0];
  assert.ok(g.strokes.length>0,c);
  assert.ok(g.strokes.every(s=>Number.isFinite(s.length)&&s.length>0));
  assert.equal(markerStrokeProgress(g.strokes[0],0),0);
  assert.ok(g.strokes.every(s=>markerStrokeProgress(s,g.end)===1));
 }
});
test('each glyph is fully written before the next begins; B draws stem then continuous bowls', () => {
 const p=layoutMarker('Budapest');
 assert.equal(p.glyphs[0].strokes.length,2);
 assert.ok(guides.B[0][0][1] < guides.B[0].at(-1)![1]);
 assert.deepEqual(guides.B[1][0], guides.B[0][0]);
 for(let i=1;i<p.glyphs.length;i++)assert.ok(p.glyphs[i].start>=p.glyphs[i-1].end);
 assert.ok(layoutMarker('AB\nCD').height>layoutMarker('ABCD').height);
});
test('unknown characters survive without invented strokes',()=>{
 const p=layoutMarker('é🦉');assert.equal(p.glyphs.length,2);assert.equal(p.glyphs[1].char,'🦉');assert.equal(p.glyphs[0].strokes.length,0);
});

test('lowercase single-gesture letters never inherit uppercase multi-gesture regions', () => {
 assert.equal(layoutMarker('i').glyphs[0].strokes.length, 1);
 assert.equal(markerStrokeRegions('i'), undefined);
 assert.equal(markerStrokeRegions('I')?.length, 3);
 for (const char of Object.keys(guides)) {
  const selectedRegions = markerStrokeRegions(char);
  if (selectedRegions) assert.equal(selectedRegions.length, layoutMarker(char).glyphs[0].strokes.length, char);
 }
});
