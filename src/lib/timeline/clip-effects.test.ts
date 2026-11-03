import assert from 'node:assert/strict';
import test from 'node:test';
import { hasMaskGlitch, hasSubjectGlow, maskGlitchPreset, removeMaskGlitch } from './clip-effects';
import { resolveSubjectGlow } from './subject-glow';

test('effect lifecycle retains timed settings while disabled and only removes owned fields', () => {
  const original = { keyframes: { opacity: [{ t: 0, v: .5 }] }, grade_exposure: .3 };
  const applied = { ...original, ...maskGlitchPreset(original, true) };
  assert.equal(hasMaskGlitch(applied), true);
  assert.equal(hasSubjectGlow(applied), true);
  const disabled = { ...applied, subject_effect_state: 'disabled' };
  assert.equal(hasMaskGlitch(disabled), true);
  for (const t of [0, .05, .2, 0]) {
    assert.equal(resolveSubjectGlow(disabled, t).flash, 0);
    assert.equal(resolveSubjectGlow(disabled, t).strength, 0);
    assert.deepEqual(resolveSubjectGlow({ ...disabled, subject_effect_state: 'enabled' }, t), resolveSubjectGlow(applied, t));
  }
  const removed = { ...applied, ...removeMaskGlitch(applied) };
  assert.equal(hasMaskGlitch(removed), false);
  assert.deepEqual(removed.keyframes, original.keyframes);
  assert.equal(removed.grade_exposure, .3);
  assert.equal(resolveSubjectGlow(removed, 0).flash, 0);
  assert.equal(resolveSubjectGlow(removed, 0).strength, 0);
});
test('legacy animations stay discoverable during zero phases; optional glow preserves its keys', () => {
  const legacy = { keyframes: { subject_flash: [{ t: 0, v: 1 }, { t: .1, v: 0 }], subject_glow: [{ t: 0, v: 2 }] } };
  assert.equal(hasMaskGlitch(legacy), true);
  assert.equal(hasSubjectGlow(legacy), true);
  assert.equal(resolveSubjectGlow({ ...legacy, subject_glow_enabled: false }, 0).strength, 0);
  assert.equal(resolveSubjectGlow({ ...legacy, subject_glow_enabled: true }, 0).strength, 2);
  assert.equal(hasMaskGlitch({}), false);
});

test('independent effects preserve sibling animation and legacy disabled state', async () => {
  const { subjectEffectPreset, removeSubjectEffect, subjectEffectState, setSubjectEffectEnabled } = await import('./clip-effects');
  const legacy = { ...maskGlitchPreset({}, true), subject_effect_state: 'disabled' };
  const flash = { ...legacy, ...subjectEffectPreset(legacy, 'flash') };
  assert.equal(resolveSubjectGlow(flash, 0).flash, 1);
  assert.equal(resolveSubjectGlow(flash, 0).strength, 0);
  assert.equal(subjectEffectState(flash, 'glow'), 'disabled');
  assert.deepEqual(flash.keyframes.subject_glow, legacy.keyframes.subject_glow);
  const both = { ...flash, ...setSubjectEffectEnabled(flash, 'glow', true) };
  assert.equal(resolveSubjectGlow(both, 0).strength, 1.8);
  const removed = { ...both, ...removeSubjectEffect(both, 'flash') };
  assert.equal(resolveSubjectGlow(removed, 0).flash, 0);
  assert.equal(resolveSubjectGlow(removed, 0).strength, 1.8);
  assert.equal(subjectEffectState(removed, 'flash'), 'removed');
});
