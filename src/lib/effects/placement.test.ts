import assert from 'node:assert/strict';
import test from 'node:test';
import { isEditingRecipe, isGalleryRecipe, effectHome } from './placement';

test('boundary-only studies are excluded without hiding coordinated subject recipes', () => {
  for (const id of ['FX-FILM-BURN', 'FX-CAMERA-FLASH', 'FX-BLACKOUT', 'FX-WHIP-PAN']) assert.equal(isEditingRecipe({ id }), false);
  for (const id of ['FX-MASK-GLITCH', 'FX-08', 'FX-SCENE-PORTAL', 'layered-paper-cutout']) assert.equal(isEditingRecipe({ id }), true);
  assert.match(effectHome('FX-WHIP-PAN'), /transition join/);
  assert.match(effectHome('FX-FILM-BURN'), /transition join/);
});
test('private recipes cannot be reclassified by a shared ID or a display title', () => {
  assert.equal(isEditingRecipe({ id: 'FX-WHIP-PAN', origin: 'user' }), true);
  assert.equal(isEditingRecipe({ id: 'user-speed-entrance-exit', origin: 'user' }), true);
});
test('the gallery hides shared recipes without an example and retired ones, never the user\'s', () => {
  assert.equal(isGalleryRecipe({ id: 'FX-X', skill: 's', title: 't', description: '', prompt: '', inputs: [] }), false);
  assert.equal(isGalleryRecipe({ id: 'FX-X', skill: 's', title: 't', description: '', prompt: '', inputs: [], video: 'x.mp4' }), true);
  assert.equal(isGalleryRecipe({ id: 'FX-08', skill: 's', title: 't', description: '', prompt: '', inputs: [], video: 'x.mp4' }), false);
  assert.equal(isGalleryRecipe({ id: 'FX-X', origin: 'user', skill: 's', title: 't', description: '', prompt: '', inputs: [] }), true);
});
