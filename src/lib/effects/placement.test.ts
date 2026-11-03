import assert from 'node:assert/strict';
import test from 'node:test';
import { isGalleryRecipe } from './placement';

test('the gallery hides shared recipes without an example, never the user\'s', () => {
  assert.equal(isGalleryRecipe({ id: 'FX-X', skill: 's', title: 't', description: '', prompt: '', inputs: [] }), false);
  assert.equal(isGalleryRecipe({ id: 'FX-X', skill: 's', title: 't', description: '', prompt: '', inputs: [], video: 'x.mp4' }), true);
  assert.equal(isGalleryRecipe({ id: 'FX-X', origin: 'user', skill: 's', title: 't', description: '', prompt: '', inputs: [] }), true);
});
