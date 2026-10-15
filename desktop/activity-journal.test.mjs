import assert from 'node:assert/strict';
import test from 'node:test';
import { createEpisodeLog } from './activity-journal.mjs';

test('an episode keeps the request, merged text, tool calls, results and staged proposals in order', async () => {
  const batches = [];
  const fetchImpl = async (url, init) => { batches.push(JSON.parse(init.body)); return { ok: true }; };
  const log = createEpisodeLog({ origin: 'http://127.0.0.1:3123', fetchImpl, now: () => '2026-10-10T00:00:00.000Z' });
  const id = log.begin({ projectId: 'p', provider: 'codex', model: 'gpt-6.1-sol', display: 'Reverse this clip', sent: '[context]\nReverse this clip', contract: { kind: 'editing-contract', tools: [] }, evaluation: { case: 'clip-reverse', run: 0 } });
  log.reasoning('Looking'); log.reasoning(' at the clip');
  log.text('I will '); log.text('reverse it.');
  log.tool({ phase: 'call', id: 'c1', tool: 'proposal_create', arguments: { proposal: { summary: 'Reverse' } } });
  log.tool({ phase: 'result', id: 'c1', tool: 'proposal_create', result: { content: [{ type: 'text', text: '{"proposal_id":"x"}' }] } });
  log.text('Staged.');
  log.end('completed', 'I will reverse it.Staged.', { eval_pass: true });
  await log.settled();
  const records = batches.flatMap(batch => batch.records);
  assert.ok(batches.every(batch => batch.episode_id === id));
  assert.deepEqual(records.map(record => record.type), ['episode_start', 'snapshot', 'user', 'reasoning', 'assistant_text', 'tool_call', 'tool_result', 'assistant_text', 'episode_end']);
  assert.deepEqual(records.map(record => record.seq), records.map((_, index) => index));
  assert.equal(records[0].data.agent, 'gpt');
  assert.deepEqual(records.at(-1).data.proposal_ids, ['x']);
  assert.deepEqual([records[0].data.eval.case, records.at(-1).data.eval_pass], ['clip-reverse', true]);
  assert.equal(records[3].data.text, 'Looking at the clip');
  assert.deepEqual(records[5].data.arguments, { proposal: { summary: 'Reverse' } });
});

test('a refused or unreachable store never breaks the turn; lost records are counted', async () => {
  const log = createEpisodeLog({ origin: 'http://127.0.0.1:3123', fetchImpl: async () => { throw Error('offline'); } });
  log.begin({ projectId: 'p', provider: 'local', sent: 'hi' });
  log.end('completed', 'hello');
  await log.settled();
  assert.equal(log.dropped, 3, "start, request and end");
});
