import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const node24 = process.versions.node.startsWith('24.');
const runtime = node24 ? await import('./harness-langgraph.mjs') : null;
const openSqliteHarness = runtime?.openSqliteHarness;

test('SQLite checkpoint survives close/reopen and resumes an interrupt from a recorded outcome', { skip: !node24 && 'Native SQLite dependency is qualified for Node 24' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dreamcut-langgraph-'));
  const databasePath = join(dir, 'session.sqlite');
  try {
    let harness = openSqliteHarness({ databasePath });
    const input = { threadId: 'session-1', operationId: 'op-1', name: 'synthetic_create', arguments: { b: 2, a: 1 } };
    const started = await harness.start(input);
    assert.equal(started.operation.status, 'pending');
    assert.deepEqual(started.graphState.next, ['awaitOutcome']);
    assert.equal(started.graphState.tasks[0].interrupts[0].value.operation_id, 'op-1');
    harness.markDispatched('op-1');
    harness.close();

    harness = openSqliteHarness({ databasePath });
    assert.deepEqual(await harness.resume({ threadId: 'session-1', operationId: 'op-1' }), {
      blocked: true,
      reason: 'unknown_mutation_outcome',
      operation: harness.get('op-1'),
    });
    assert.equal(harness.get('op-1').status, 'dispatched');
    await harness.reconcile('op-1', async () => ({ status: 'completed', outcome: { proposalId: 'draft-1' } }));
    harness.close(); // owner result persisted, graph still interrupted

    harness = openSqliteHarness({ databasePath });
    const resumed = await harness.resume({ threadId: 'session-1', operationId: 'op-1' });
    assert.equal(resumed.blocked, false);
    assert.deepEqual(resumed.graphState.next, []);
    assert.deepEqual(resumed.graphState.values.outcome, { proposalId: 'draft-1' });
    harness.close();

    harness = openSqliteHarness({ databasePath });
    const again = await harness.resume({ threadId: 'session-1', operationId: 'op-1' });
    assert.equal(again.blocked, false);
    assert.deepEqual(again.graphState.values.outcome, { proposalId: 'draft-1' });
    harness.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('unknown external outcome blocks and cannot be redispatched blindly', { skip: !node24 && 'Native SQLite dependency is qualified for Node 24' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dreamcut-langgraph-'));
  try {
    const databasePath = join(dir, 'session.sqlite');
    let harness = openSqliteHarness({ databasePath });
    const input = { threadId: 'session-2', operationId: 'op-2', name: 'synthetic_import', arguments: { source: 'fixture' } };
    await harness.start(input);
    harness.close();
    harness = openSqliteHarness({ databasePath });
    assert.equal((await harness.resume({ threadId: 'session-2', operationId: 'op-2' })).reason, 'operation_not_dispatched');
    harness.markDispatched('op-2');
    await harness.reconcile('op-2', async () => ({ status: 'unknown' }));
    assert.equal((await harness.resume({ threadId: 'session-2', operationId: 'op-2' })).reason, 'unknown_mutation_outcome');
    assert.throws(() => harness.markDispatched('op-2'), /already dispatched/);
    assert.throws(() => harness.stage({ ...input, arguments: { source: 'different' } }), /different arguments/);
    harness.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
