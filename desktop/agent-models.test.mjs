import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentModels, parseCodexModels } from './agent-models.mjs';

test('Codex models keep listed entries, best first', () => {
  const stdout = JSON.stringify({ models: [
    { slug: 'b', display_name: 'B', visibility: 'list', priority: 2 },
    { slug: 'hidden', display_name: 'Hidden', visibility: 'hide', priority: 0 },
    { slug: 'a', display_name: 'A', visibility: 'list', priority: 1 },
  ] });
  assert.deepEqual(parseCodexModels(stdout), [{ model: 'a', label: 'A', isDefault: true }, { model: 'b', label: 'B', isDefault: false }]);
});

test('Claude models come from initialization only, and lookups are cached', async () => {
  let queries = 0, closed = 0;
  const sdk = { query({ options }) {
    queries++;
    assert.deepEqual(options.tools, []); assert.deepEqual(options.settingSources, []);
    return { initializationResult: async () => ({ models: [{ value: 'default', displayName: 'Default' }, { value: 'opus', displayName: 'Opus' }] }), close() { closed++; } };
  } };
  const models = createAgentModels({ sdk });
  const [first, second] = await Promise.all([models.list('claude', { env: { ANTHROPIC_API_KEY: 'x' } }), models.list('claude', { env: {} })]);
  assert.deepEqual(first.map(item => item.model), ['default', 'opus']);
  assert.equal(first[0].isDefault, true);
  assert.equal(second, first);
  assert.equal(queries, 1); assert.equal(closed, 1);
});
