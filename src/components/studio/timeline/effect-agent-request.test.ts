import assert from 'node:assert/strict';
import test from 'node:test';
import { effectAgentRequest } from './library-effect-catalog';

test('effect handoff pins the selected target and preserves human review', () => {
  const recipe = { id: 'test-recipe-v2', title: 'Example effect', skill: 'video-compositing', prompt: 'Prepare an editable effect.', inputs: [] };
  const request = effectAgentRequest('test-project', recipe, { id: 'clip-123', label: 'Second shot' });
  assert.ok(request.startsWith('Use the Example effect template with my footage.'));
  for (const required of ['Second shot', 'clip-123', 'unless I explicitly change it']) assert.ok(request.includes(required));
  assert.ok(!effectAgentRequest('test-project', recipe).includes('Target clip:'));
  assert.equal(recipe.prompt, 'Prepare an editable effect.');
});
