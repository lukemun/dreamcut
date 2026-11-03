import test from 'node:test';
import assert from 'node:assert/strict';
import {formatInspectorNumber, inspectorNumberCommit, inspectorNumberGestureStart} from './inspector-number-values';

test('exact proposal entry and slider transport retain values finer than their displayed step', () => {
  for (const value of [11.875, .125, .335, .085, .035, .025, 1.1255, -.8745]) {
    const committed = inspectorNumberCommit(String(value), -2, 100, .01, 2, true)!;
    assert.equal(Number(committed.text), value);
    assert.equal(Number(formatInspectorNumber(value, .01, 2, true)), value);
    assert.equal(inspectorNumberCommit(committed.text, -2, 100, .01, 2, true)?.text, committed.text);
  }
});

test('exact entry clamps before transport without rounding outside fractional boundaries', () => {
  assert.equal(inspectorNumberCommit('500', 0, 11.875, .01, 2, true)?.text, '11.875');
  assert.equal(inspectorNumberCommit('-500', -.8745, 1.1255, .01, 2, true)?.text, '-0.8745');
  assert.equal(inspectorNumberCommit('.125', 0, .125, .01, 2, true)?.text, '.125'.replace(/^\./, '0.'));
  assert.equal(inspectorNumberCommit('invalid', 0, 1, .01, 2, true), null);
});

test('other inspector consumers retain their declared display formatting', () => {
  assert.equal(formatInspectorNumber(.125, .01, 2), '0.13');
  assert.equal(formatInspectorNumber(46.3, .1), '46.3');
});

test('keyboard, clicker and scrub steps start at stored precision, not the rounded readout', () => {
  for (const [display, exact, expected] of [['0.13', .1255, .1355], ['0.09', .085, .095], ['0.04', .035, .045]] as const) {
    const start = inspectorNumberGestureStart(display, null, exact, true);
    const next = Number((start + .01).toPrecision(15));
    assert.equal(inspectorNumberCommit(String(next), 0, 1, .01, 2, true)?.value, expected);
    assert.equal(Number((next - .01).toPrecision(15)), exact);
  }
});

test('an active typed draft owns the next step and existing consumers keep their display seed', () => {
  assert.equal(inspectorNumberGestureStart('0.13', '0.2', .1255, true), .2);
  assert.equal(inspectorNumberGestureStart('0.13', null, .1255, false), .13);
});

test('integer frame controls retain whole-number commits when exact transport is enabled', () => {
  assert.deepEqual(inspectorNumberCommit('2.5', 2, 12, 1, undefined, true, true), {value:3,text:'3'});
  assert.deepEqual(inspectorNumberCommit('12.5', 2, 12, 1, undefined, true, true), {value:12,text:'12'});
  assert.equal(formatInspectorNumber(3.5, 1, undefined, true, true), '4');
  assert.deepEqual(inspectorNumberCommit('2.5', 2.2, 12.8, 1, undefined, true, true), {value:3,text:'3'});
  assert.equal(inspectorNumberCommit('2.5', 2, 12, 1, undefined, true)?.value, 2.5, 'continuous values do not become integers just because the step is1');
});
