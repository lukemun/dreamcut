import assert from 'node:assert/strict';
import test from 'node:test';
import { portableSchemaViolations, toPortableToolSchema, toolCatalogViolations } from './tool-schema-portability.mjs';

const unit = { type: 'number', minimum: 0, maximum: 1 };

test('homogeneous tuples become one items schema with an exact length', () => {
  const portable = toPortableToolSchema({ type: 'object', properties: { bezier: { type: 'array', items: [unit, unit, unit, unit] } } });
  assert.deepEqual(portable.properties.bezier, { type: 'array', items: unit, minItems: 4, maxItems: 4 });
  assert.deepEqual(portableSchemaViolations(portable), []);
});

test('nested tuples normalize inside out', () => {
  const point = { type: 'array', items: [unit, unit] };
  const portable = toPortableToolSchema({ type: 'object', properties: { quad: { type: 'array', items: [point, point, point, point] } } });
  assert.deepEqual(portable.properties.quad.items, { type: 'array', items: unit, minItems: 2, maxItems: 2 });
  assert.equal(portable.properties.quad.minItems, 4);
});

test('mixed tuples refuse instead of silently widening', () => {
  assert.throws(() => toPortableToolSchema({ type: 'object', properties: { pair: { type: 'array', items: [unit, { type: 'string' }] } } }), /tuple positions differ/);
});

test('property names that match keywords are data, not schema keywords', () => {
  const schema = { type: 'object', properties: { items: { type: 'string' }, not: { type: 'boolean' } }, required: ['items'], enum: undefined };
  assert.deepEqual(portableSchemaViolations(schema), []);
});

test('reports constructs at least one supported client rejects', () => {
  const keywords = portableSchemaViolations({ type: 'object', oneOf: [{ required: ['a'] }], properties: { p: { type: 'array', items: [unit] }, r: { $ref: '#/x' } } }).map(v => v.keyword);
  assert.deepEqual(keywords.sort(), ['$ref', 'items', 'oneOf']);
  assert.equal(portableSchemaViolations({ type: 'array' })[0].keyword, 'type');
  assert.equal(toolCatalogViolations([{ name: 't', inputSchema: { type: 'object', allOf: [] } }])[0].tool, 't');
});
