import { hashOperationArguments, openSqliteHarness } from './harness-langgraph.mjs';

/**
 * Optional spike adapter for the file-backed session. The file session still
 * owns its lease, budgets and conversation; SQLite supplies an independently
 * restartable interrupt and a durable result receipt. External tool dispatch
 * remains in the runner. Do not use this as an exactly-once claim.
 */
export function createLangGraphCoordinator(session, { databasePath } = {}) {
  if (!session?.snapshot || !session?.beginTool || !session?.finishTool || !session?.reconcile) {
    throw new TypeError('A file-backed harness session is required.');
  }
  const sqlite = openSqliteHarness({ databasePath });
  const sessionId = session.snapshot().session_id;
  if (typeof sessionId !== 'string' || !sessionId) {
    sqlite.close();
    throw new Error('Session has no durable session_id.');
  }
  const threadIdFor = operationId => JSON.stringify([sessionId, operationId]);

  async function beginTool({ id, tool, arguments: args }) {
    // The file lease and budget gate run first. If SQLite then fails, the file
    // operation remains pending/unknown and the runner must stop safely.
    const operationId = await session.beginTool({ id, tool, arguments: args });
    await sqlite.start({ operationId, threadId: threadIdFor(operationId), name: tool, arguments: args });
    sqlite.markDispatched(operationId); // before the caller can invoke MCP
    return operationId;
  }

  async function finishTool(operationId, result) {
    // Persist the acknowledged result before advancing the graph or file
    // conversation. A crash in this window can recover from SQLite.
    sqlite.recordOutcome(operationId, result);
    const resumed = await sqlite.resume({ operationId, threadId: threadIdFor(operationId) });
    if (resumed.blocked) throw new Error(`Cannot complete operation ${operationId}: ${resumed.reason}`);
    return session.finishTool(operationId, result);
  }

  async function reconcileRecorded() {
    const recovered = [];
    for (const operation of session.snapshot().operations) {
      if (operation.status !== 'unknown') continue;
      const receipt = sqlite.get(operation.id);
      if (!receipt) continue;
      if (receipt.threadId !== threadIdFor(operation.id) || receipt.name !== operation.tool ||
          receipt.argumentsHash !== hashOperationArguments(operation.arguments)) {
        throw new Error(`SQLite receipt does not match operation ${operation.id}; manual reconciliation required.`);
      }
      if (receipt.status !== 'completed') continue; // dispatched has unknown outcome
      const resumed = await sqlite.resume({ operationId: operation.id, threadId: receipt.threadId });
      if (resumed.blocked) continue;
      await session.reconcile(operation.id, {
        outcome: 'completed', result: receipt.outcome,
        evidence: `SQLite recorded tool outcome for operation ${operation.id}, arguments sha256 ${receipt.argumentsHash}`,
      });
      recovered.push(operation.id);
    }
    return recovered;
  }

  return {
    snapshot: session.snapshot,
    saveConversation: session.saveConversation,
    compactConversation: session.compactConversation,
    compact: session.compact,
    charge: session.charge,
    beginTool,
    finishTool,
    reconcile: session.reconcile,
    reconcileRecorded,
    sqlite,
    close: async () => { sqlite.close(); await session.close(); },
  };
}
