import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutHandwriting, penStrokeProgress, handwritingUnsupported } from './handwriting';
import { presetsForElementType } from './animation-presets';

test('pen lifts preserve separate authored B strokes and proportional timing', () => {
  const b = layoutHandwriting('B');
  assert.ok(b.strokes.length > 1);
  assert.equal(penStrokeProgress(b.strokes[0], 0), 0);
  const middle = b.strokes[0].length / 2;
  assert.equal(penStrokeProgress(b.strokes[0], middle), .5);
  assert.equal(penStrokeProgress(b.strokes[1], middle), 0);
  assert.ok(b.strokes.every(s => penStrokeProgress(s, b.duration) === 1));
});
test('different editable phrases, line breaks and alignment share the same layout engine', () => {
  for (const text of ['in Budapest', 'Day 2: Vienna!', 'ABC\n123', 'A long caption wraps here']) {
    const p = layoutHandwriting(text, 130, 'center');
    assert.ok(p.strokes.length > 0);
    assert.ok(p.width <= 134);
    assert.ok(p.strokes.every(s => Number.isFinite(s.length) && s.length > 0));
  }
  assert.ok(layoutHandwriting('ABC\n123').height > layoutHandwriting('ABC').height);
  assert.ok(layoutHandwriting('A A').duration > layoutHandwriting('AA').duration);
});
test('unsupported characters are preserved and disclosed, never silently dropped', () => {
  assert.deepEqual(handwritingUnsupported('Hi é 🦉'), ['é', '🦉']);
  assert.deepEqual(layoutHandwriting('é🦉').fallback.map(g => g.text), ['é', '🦉']);
  assert.equal(layoutHandwriting('').strokes.length, 0);
  assert.ok(presetsForElementType('caption_text').includes('handwriting'));
  assert.ok(!presetsForElementType('still').includes('handwriting'));
});
