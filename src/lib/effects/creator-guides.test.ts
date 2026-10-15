import assert from 'node:assert/strict';
import test from 'node:test';
import { creatorGuideFor } from './creator-guides';
import { effectRecipeRequest } from './agent-request';
import { syncEffectCreatorDocs } from './creator-docs';
import { guideEffects } from './guide-examples';
import type { GuideEffect } from './guide';

test('every public catalog entry and curated workflow has a synchronized creator page', () => {
  assert.doesNotThrow(() => syncEffectCreatorDocs());
});

test('shared mask recipe asks for footage, while keeping mask preparation with DreamCut', () => {
  const effect: GuideEffect = { id: 'FX-MASK-GLITCH', skill: 'mask-glitch', title: 'Mask Glitch', description: '', prompt: 'Build a continuous handoff.', inputs: [] };
  const guide = creatorGuideFor(effect)!;
  assert.match(guide.inputs[0].directions, /DreamCut prepares/);
  const request = effectRecipeRequest(effect);
  for (const text of ['FX-MASK-GLITCH', 'mask-glitch', 'catalog.json', 'My inputs and target:', 'generation authorization', 'do not apply or approve', 'without a gap']) assert.ok(request.includes(text), text);
});

test('a private recipe with a shared identity does not inherit shared assets or instructions', () => {
  const effect: GuideEffect = { id: 'FX-MASK-GLITCH', origin: 'user', skill: 'mask-glitch', title: 'My recipe', description: '', prompt: 'Keep my version.', inputs: [], inputDirections: [{ title: 'My source', directions: 'Supply the full recording.' }], preparation: 'Use my recorded sequence.' };
  assert.equal(creatorGuideFor(effect), undefined);
  const request = effectRecipeRequest(effect);
  assert.match(request, /Supply the full recording/);
  assert.match(request, /Use my recorded sequence/);
  assert.ok(!request.includes('catalog.json'));
  assert.ok(!request.includes('Ordered shots'));
});

test('candidate and partial limitations survive the portable handoff', () => {
  const effect: GuideEffect = { skill: 'recreate-effect', title: 'Candidate', description: '', inputs: [], prompt: 'Assess this reference.', status: 'candidate', limitations: ['No recreation tested.'] };
  assert.match(effectRecipeRequest(effect), /reference-only candidate/);
  assert.match(effectRecipeRequest(effect), /No recreation tested/);
  const birds = guideEffects.find(effect => effect.id === 'FX-08')!;
  assert.ok(!effectRecipeRequest(birds).includes('start on the dinosaurs'));
  assert.match(effectRecipeRequest(birds), /Batched pop-ins adapt/);
});
