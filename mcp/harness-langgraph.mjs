import { createHash } from 'node:crypto';
import { Annotation, Command, END, START, StateGraph, interrupt } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';

// Spike boundary: the graph never dispatches an external operation. Its interrupt
// waits for an outcome already recorded by the owning tool's coordinator.
export function createOperationGraph(checkpointer) {
  const State = Annotation.Root({
    operationId: Annotation(),
    outcome: Annotation(),
  });
  return new StateGraph(State)
    .addNode('awaitOutcome', state => ({
      outcome: interrupt({ kind: 'await_operation_outcome', operation_id: state.operationId }),
    }))
    .addEdge(START, 'awaitOutcome')
    .addEdge('awaitOutcome', END)
    .compile({ checkpointer });
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function serialized(value, label) {
  const json = canonicalJson(value);
  if (typeof json !== 'string' || JSON.parse(json) === undefined) throw new TypeError(`${label} must be JSON data.`);
  return json;
}

export function hashOperationArguments(args) {
  return createHash('sha256').update(serialized(args, 'arguments')).digest('hex');
}

function requiredId(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a nonempty string.`);
  return value;
}

function snapshot(row) {
  if (!row) return undefined;
  return {
    operationId: row.operation_id,
    threadId: row.thread_id,
    name: row.name,
    argumentsHash: row.arguments_hash,
    status: row.status,
    outcome: row.outcome_json === null ? undefined : JSON.parse(row.outcome_json),
  };
}

/**
 * Open a bounded local persistence spike. The caller owns its session lease,
 * external dispatch, owner lookup, and current DreamCut authority checks.
 * A `dispatched` row is deliberately unknown after restart until reconciled.
 */
export function openSqliteHarness({ databasePath, graphFactory = createOperationGraph }) {
  requiredId(databasePath, 'databasePath');
  const checkpointer = SqliteSaver.fromConnString(databasePath);
  const db = checkpointer.db;
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS harness_operations (
    operation_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    name TEXT NOT NULL,
    arguments_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'dispatched', 'completed')),
    outcome_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const graph = graphFactory(checkpointer);
  const configFor = threadId => ({ configurable: { thread_id: requiredId(threadId, 'threadId') } });
  const get = operationId => snapshot(db.prepare('SELECT * FROM harness_operations WHERE operation_id = ?').get(requiredId(operationId, 'operationId')));

  function stage({ operationId, threadId, name, arguments: args }) {
    requiredId(operationId, 'operationId');
    requiredId(threadId, 'threadId');
    requiredId(name, 'name');
    const argumentsHash = hashOperationArguments(args);
    const existing = get(operationId);
    if (existing) {
      if (existing.threadId !== threadId || existing.name !== name || existing.argumentsHash !== argumentsHash) {
        throw new Error('Operation ID already belongs to different arguments or session.');
      }
      return existing;
    }
    db.prepare(`INSERT INTO harness_operations (operation_id, thread_id, name, arguments_hash, status)
      VALUES (?, ?, ?, ?, 'pending')`).run(operationId, threadId, name, argumentsHash);
    return get(operationId);
  }

  async function start(input) {
    const operation = stage(input); // durable intent before any graph work
    const config = configFor(operation.threadId);
    const prior = await graph.getState(config);
    if (!prior?.values?.operationId) await graph.invoke({ operationId: operation.operationId }, config);
    else if (prior.values.operationId !== operation.operationId) throw new Error('Thread already owns a different operation.');
    return { operation, graphState: await graph.getState(config) };
  }

  function markDispatched(operationId) {
    const operation = get(operationId);
    if (!operation) throw new Error('Operation must be staged before dispatch.');
    if (operation.status !== 'pending') throw new Error('Operation was already dispatched or completed; reconcile before retry.');
    db.prepare(`UPDATE harness_operations SET status = 'dispatched', updated_at = CURRENT_TIMESTAMP WHERE operation_id = ?`).run(operationId);
    return get(operationId);
  }

  function recordOutcome(operationId, outcome) {
    const operation = get(operationId);
    if (!operation || operation.status !== 'dispatched') throw new Error('Only a dispatched operation can record an outcome.');
    const outcomeJson = serialized(outcome, 'outcome');
    db.prepare(`UPDATE harness_operations SET status = 'completed', outcome_json = ?, updated_at = CURRENT_TIMESTAMP WHERE operation_id = ?`)
      .run(outcomeJson, operationId);
    return get(operationId);
  }

  async function reconcile(operationId, lookup) {
    const operation = get(operationId);
    if (!operation) throw new Error('Unknown operation.');
    if (operation.status !== 'dispatched') return operation;
    if (typeof lookup !== 'function') throw new TypeError('An owner lookup is required to reconcile an unknown dispatch.');
    const found = await lookup(operation);
    if (found?.status === 'completed' && Object.hasOwn(found, 'outcome')) return recordOutcome(operationId, found.outcome);
    return get(operationId); // unknown remains blocked; never redispatch here
  }

  async function resume({ operationId, threadId }) {
    const operation = get(operationId);
    if (!operation || operation.threadId !== threadId) throw new Error('Operation does not belong to this thread.');
    const config = configFor(threadId);
    const state = await graph.getState(config);
    if (state?.values?.operationId !== operationId) throw new Error('Missing or mismatched graph checkpoint.');
    if (operation.status !== 'completed') return { blocked: true, reason: operation.status === 'dispatched' ? 'unknown_mutation_outcome' : 'operation_not_dispatched', operation };
    if (state.next?.length) await graph.invoke(new Command({ resume: operation.outcome }), config);
    return { blocked: false, operation: get(operationId), graphState: await graph.getState(config) };
  }

  return { graph, checkpointer, stage, start, get, markDispatched, recordOutcome, reconcile, resume, close: () => db.close() };
}
