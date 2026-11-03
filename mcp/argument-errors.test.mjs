import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { explainInvalidArguments, unknownFieldHints } from './argument-errors.mjs';

test('rejected proposal arguments name the unknown field and the closest accepted ones', () => {
  const schema = JSON.parse(fs.readFileSync(new URL('./proposal-schema.json', import.meta.url), 'utf8'));
  const args = { proposal: { options: [{ operations: [{ element_id: 'x', patch: { keyframes: { reverse: true } }, props: { reverse: true } }] }] } };
  const wrapped = { type: 'object', properties: { proposal: schema }, additionalProperties: false };
  const hints = unknownFieldHints(wrapped, args);
  assert.ok(hints.some(hint => hint.startsWith('proposal.options[0].operations[0].patch.keyframes is not an accepted field; accepted here:')), hints.join('\n'));
  assert.ok(hints.some(hint => /operations\[0\]\.props\.reverse is not an accepted field; closest accepted: .*playback_reverse/.test(hint)), hints.join('\n'));
  assert.equal(explainInvalidArguments(wrapped, { proposal: {} }, 'base'), 'base');
});

test('a rejected value comes back with the field\'s own description', () => {
  const schema = { type: 'object', properties: { patch: { type: 'object', properties: { playback_rate: { type: 'number', exclusiveMinimum: 0, description: 'To play backward, set props.playback_reverse.' } } } } };
  assert.match(explainInvalidArguments(schema, { patch: { playback_rate: -1 } }, 'data/patch/playback_rate must be > 0'), /patch\.playback_rate: To play backward, set props\.playback_reverse\./);
});

test('a missing required field is named with its description', () => {
  const schema = { type: 'object', properties: { options: { type: 'array', items: { type: 'object', required: ['requested_mutations'], properties: { requested_mutations: { type: 'integer', description: 'Required. The number of fields this option changes.' } } } } } };
  assert.match(explainInvalidArguments(schema, { options: [{}] }, "data/options/0 must have required property 'requested_mutations'"), /options\[0\]\.requested_mutations: Required\. The number of fields/);
});
