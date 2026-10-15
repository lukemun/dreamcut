import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { FEATURE_VOCABULARY, deriveControlLabels, featureEntries, featureSchema } from './feature-index.mjs';
import { searchScore } from './capability-catalog.mjs';

const schema = JSON.parse(fs.readFileSync(new URL('./proposal-schema.json', import.meta.url), 'utf8'));
const operation = schema.properties.options.items.properties.operations.items.properties;

test('the label snapshot matches the control registries', async () => {
  const snapshot = JSON.parse(fs.readFileSync(new URL('./feature-labels.json', import.meta.url), 'utf8')).labels;
  assert.deepEqual(snapshot, await deriveControlLabels(), 'Run: node --import tsx mcp/feature-index.mjs --write-labels');
});

test('features are derived from the proposal schema and vocabulary only names real features', () => {
  const entries = featureEntries();
  const ids = new Set(entries.map(entry => entry.id));
  assert.equal(ids.size, entries.length, 'feature ids are unique');
  for (const kind of ['create_text', 'source_range_cut', 'set_output_format', 'use_video_stabilization', 'use_voice_enhancement', 'set_lane_order', 'create_transition']) assert.ok(ids.has(`feature:${kind}`), kind);
  for (const prop of Object.keys(operation.props.properties)) assert.ok(ids.has(`feature:props.${prop}`), prop);
  for (const field of Object.keys(operation.patch.properties)) assert.ok(ids.has(`feature:patch.${field}`), field);
  for (const key of Object.keys(FEATURE_VOCABULARY)) assert.ok(ids.has(`feature:${key}`), `vocabulary key ${key} names no derived feature`);
  for (const entry of entries) {
    assert.deepEqual([entry.kind, entry.capability, entry.tool], ['feature', 'proposal-authoring', 'proposal_create']);
    assert.ok(featureSchema(entry.field_path), `${entry.field_path} resolves in the proposal schema`);
  }
  const scale = entries.find(entry => entry.id === 'feature:props.media_scale');
  assert.ok(scale.search_aliases.includes('Scale') && scale.search_aliases.includes('Size'), 'registry labels become aliases');
});

test('a described field becomes searchable through its description', () => {
  const fixture = { properties: { options: { items: { properties: { operations: { items: { properties: {
    props: { properties: { quiet_flag: { type: 'boolean' }, wobble_amount: { type: 'number', description: 'Adds a gentle wobble to handheld shots.' } } },
  } } } } } } } };
  const [quiet, wobble] = featureEntries({ schema: fixture, labels: {}, vocabulary: {} });
  assert.equal(searchScore(quiet, 'gentle wobble'), 0);
  assert.ok(searchScore(wobble, 'gentle wobble') > 0);
  assert.equal(wobble.description, 'Adds a gentle wobble to handheld shots.');
  assert.equal(JSON.stringify(wobble).includes('handheld shots. '), false, 'search text stays off the serialized entry');
});
