import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openSession } from './harness-session.mjs';

const node24 = process.versions.node.startsWith('24.');
const runtime = node24 ? await import('./harness-langgraph-coordinator.mjs') : null;
const createLangGraphCoordinator = runtime?.createLangGraphCoordinator;

test('coordinator recovers a recorded result after file checkpoint interruption', { skip: !node24 && 'Native SQLite dependency is qualified for Node 24' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dreamcut-langgraph-coordinator-'));
  const databasePath = join(directory, 'graph.sqlite');
  try {
    let coordinator = createLangGraphCoordinator(await openSession(directory), { databasePath });
    await coordinator.beginTool({ id: 'call-1', tool: 'synthetic_proposal', arguments: { project_id: 'fixture' } });
    const result = { content: [{ type: 'text', text: 'draft-1' }], structuredContent: { proposal_id: 'draft-1' } };
    coordinator.sqlite.recordOutcome('call-1', result); // crash after server acknowledgement, before file finish
    await coordinator.close();

    coordinator = createLangGraphCoordinator(await openSession(directory), { databasePath });
    assert.equal(coordinator.snapshot().operations[0].status, 'unknown');
    assert.deepEqual(await coordinator.reconcileRecorded(), ['call-1']);
    assert.equal(coordinator.snapshot().operations[0].status, 'completed');
    assert.deepEqual(coordinator.snapshot().operations[0].result, result);
    assert.deepEqual(await coordinator.reconcileRecorded(), []);
    await coordinator.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('coordinator does not turn dispatched without acknowledgement into success', { skip: !node24 && 'Native SQLite dependency is qualified for Node 24' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dreamcut-langgraph-coordinator-'));
  const databasePath = join(directory, 'graph.sqlite');
  try {
    let coordinator = createLangGraphCoordinator(await openSession(directory), { databasePath });
    await coordinator.beginTool({ id: 'call-2', tool: 'synthetic_import', arguments: { source: 'fixture' } });
    await coordinator.close();

    coordinator = createLangGraphCoordinator(await openSession(directory), { databasePath });
    assert.deepEqual(await coordinator.reconcileRecorded(), []);
    assert.equal(coordinator.snapshot().operations[0].status, 'unknown');
    assert.equal(coordinator.sqlite.get('call-2').status, 'dispatched');
    await coordinator.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
