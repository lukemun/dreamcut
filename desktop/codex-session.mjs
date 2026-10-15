import { connectCodex } from './codex-connection.mjs';
import { restrictedCodexSession } from './codex-session-policy.mjs';
import { codexSessionStore } from './codex-session-store.mjs';
import { visibleCodexHistory } from './codex-history.mjs';
import { createCodexToolBridge } from './codex-tool-bridge.mjs';
import { acquireProjectLease, assertProjectLease } from './project-lease.mjs';
import { createHash } from 'node:crypto';


// Host-owned session. Only the host can attach an editing MCP client and journal;
// renderer callers cannot select IDs, tools, protocol methods or permissions.
export async function openCodexSession({ executable, projectDirectory, userData, env, editing, projectLease, developerInstructions, onEvent = () => {},
  connect = connectCodex, makePolicy = restrictedCodexSession, turnTimeoutMs = 300000, ephemeral = false }) {
  if (!Number.isFinite(turnTimeoutMs) || turnTimeoutMs <= 0 || turnTimeoutMs > 300000) throw Error('Invalid response time limit.');
  let client, threadId, turn, closed = false, starting = false;
  let releaseLease = () => {}, closing, pendingTool;
  const closeConnection = () => {
    if (!closing) closing = (async () => {
      try {
        if (client) await client.close();
        if (pendingTool) await pendingTool.catch(() => {});
      } finally { releaseLease(); }
    })();
    return closing;
  };
  const emit = event => { try { onEvent(event); } catch { /* UI listeners cannot change session authority. */ } };
  const clearTurn = () => { if (turn) clearTimeout(turn.timer); turn = undefined; };
  const disconnected = () => {
    if (closed) return;
    closed = true; clearTurn();
    emit({ type: 'disconnected', message: 'Codex disconnected. Reconnect before sending another message.' });
    if (client) void closeConnection();
  };
  const interrupt = async current => {
    if (current !== turn || !current.active || current.interrupting) return;
    current.interrupting = true;
    try { await client.request('turn/interrupt', { threadId, turnId: current.id }); }
    catch { current.interrupting = false; emit({ type: 'error', message: 'Could not stop the response. Close the session to disconnect.' }); }
  };
  const notify = (method, params) => {
    if (closed || params?.threadId !== threadId || !turn) return;
    const id = params.turn?.id || params.turnId;
    // turn/start may emit events before its response arrives. Bind only while the
    // host has exactly one pending start, then reconcile the returned ID below.
    if (!turn.id && starting && method === 'turn/started') turn.id = id;
    if (!id || id !== turn.id) return;
    if (method === 'turn/started') {
      turn.active = true;
      emit({ type: 'started' });
      if (turn.cancelled) void interrupt(turn);
    } else if (method === 'item/reasoning/summaryPartAdded') {
      emit({ type: 'reasoning-start' });
    } else if ((method === 'item/reasoning/summaryTextDelta' || method === 'item/reasoning/textDelta') && typeof params.delta === 'string') {
      emit({ type: 'reasoning', text: params.delta });
    } else if (method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
      emit({ type: 'text', text: params.delta });
    } else if (method === 'turn/completed') {
      const status = params.turn.status;
      clearTurn();
      emit({ type: 'completed', status: ['completed', 'interrupted', 'failed'].includes(status) ? status : 'failed' });
    }
  };
  try {
    // Resolve executable before connecting; named restricted profiles need its real path.
    const initial = await makePolicy({ projectDirectory, executable });
    if (projectLease) assertProjectLease(initial.cwd, projectLease);
    else { const owned = acquireProjectLease(initial.cwd); releaseLease = () => owned.release(); }
    if (editing?.journal.snapshot().operations.some(operation => ['pending', 'unknown'].includes(operation.status))) {
      throw Error('An earlier editing tool outcome needs reconciliation before reconnecting.');
    }
    const bridge = editing ? await createCodexToolBridge({ ...editing, onActivity: value => { if (turn) emit({ type: 'tool', ...value }); }, scope: () => ({ threadId, turnId: turn?.id, active: !closed && turn?.active && !turn.cancelled }) }) : null;
    const toolsHash = bridge ? createHash('sha256').update(JSON.stringify(bridge.tools)).digest('hex') : null;
    client = await connect(initial.connectionExecutable, { cwd: initial.cwd, env, experimentalApi: true, onNotification: notify, onDisconnect: disconnected,
      ...(bridge ? { onToolCall: params => {
        pendingTool = bridge.call(params).catch(error => {
          closed = true; clearTurn();
          emit({ type: 'disconnected', message: 'An editing tool outcome needs review before continuing. No action was retried.' });
          void closeConnection();
          throw error;
        });
        return pendingTool;
      } } : {}) });
    if (closed) throw Error('Codex disconnected during startup.');
    const effective = await client.request('config/read', { includeLayers: false, cwd: initial.cwd });
    const policy = await makePolicy({ projectDirectory, executable, mcpServerNames: Object.keys(effective.config?.mcp_servers || {}) });
    const store = userData ? await codexSessionStore(userData, policy.cwd) : null;
    const saved = await store?.read();
    if (saved && (saved.toolsHash ?? null) !== toolsHash) throw Error('Saved session tools differ from this host; start a new conversation explicitly.');
    const created = await client.request(saved ? 'thread/resume' : 'thread/start', { cwd: policy.cwd, config: policy.config,
      permissions: policy.permissions, approvalPolicy: policy.approvalPolicy,
      ...(developerInstructions ? { developerInstructions } : {}),
      ...(saved ? { threadId: saved.threadId } : { ephemeral, serviceName: 'dreamcut', ...(bridge ? { dynamicTools: bridge.tools } : {}) }) });
    if (!created.thread?.id || created.sandbox?.type !== 'readOnly') throw Error('Codex did not establish the restricted session.');
    if (saved && created.thread.id !== saved.threadId) throw Error('Codex resumed a different session.');
    threadId = created.thread.id;
    let ownershipSaved = Boolean(saved);
    const inventory = await client.request('mcpServerStatus/list', { threadId });
    if (!Array.isArray(inventory.data) || inventory.data.some(server => Object.keys(server.tools || {}).length)) {
      throw Error('Codex session contains unexpected external tools.');
    }
    if (saved) emit({ type: 'history', ...visibleCodexHistory(created.thread) });
    let modelCatalog;
    const models = async () => {
      if (closed) throw Error('Session is closed.');
      if (!modelCatalog) {
        const choices = []; let cursor;
        for (let page = 0; page < 10; page++) {
          const result = await client.request('model/list', { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) });
          if (!Array.isArray(result.data)) throw Error('Codex did not return a model list.');
          for (const item of result.data) if (!item.hidden && typeof item.model === 'string' && typeof item.displayName === 'string') choices.push({ model:item.model, label:item.displayName, isDefault:Boolean(item.isDefault) });
          cursor = result.nextCursor;
          if (!cursor) break;
          if (page === 9) throw Error('Codex model list is too large.');
        }
        if (!choices.length) throw Error('No Codex models are available.');
        const configured = created.model ?? effective.config?.model;
        modelCatalog = { models:choices, selected:choices.some(item=>item.model===configured) ? configured : (choices.find(item=>item.isDefault) ?? choices[0]).model };
      }
      return modelCatalog;
    };
    return {
      models,
      async send(text, model) {
        if (closed) throw Error('Session is closed.');
        if (starting || turn) throw Error('Wait for the current response before sending another message.');
        if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 64000) throw Error('Message must contain between 1 and 64000 bytes.');
        if (model !== undefined && !(await models()).models.some(item => item.model === model)) throw Error('Choose an available Codex model.');
        if (starting || turn || closed) throw Error('Wait for the current response or reconnect before sending.');
        starting = true;
        const current = { id: undefined, active: false, cancelled: false, interrupting: false };
        turn = current;
        current.timer = setTimeout(() => {
          if (closed || turn !== current) return;
          closed = true; clearTurn();
          emit({ type: 'disconnected', message: 'The response exceeded its time limit. Reconnect to continue; the message was not retried.' });
          void closeConnection();
        }, turnTimeoutMs);
        current.timer.unref?.();
        try {
          // A no-turn thread has no resumable rollout in Codex. Persist ownership
          // immediately before the first turn so opening/closing chat stays empty.
          if (store && !ownershipSaved) { await store.save(threadId, toolsHash); ownershipSaved = true; }
          const result = await client.request('turn/start', { threadId, ...(model ? { model } : {}), input: [{ type: 'text', text }],
            permissions: policy.permissions, approvalPolicy: policy.approvalPolicy });
          if (!result.turn?.id || (current.id && current.id !== result.turn.id)) {
            throw Error('Codex returned an inconsistent turn.');
          }
          current.id = result.turn.id;
          const answering = model ?? modelCatalog?.selected ?? created.model;
          if (answering) emit({ type: 'model', model: answering });
          if (current.cancelled) await interrupt(current);
        } catch (error) {
          // A lost acknowledgement is ambiguous: never retry on the same connection.
          closed = true; clearTurn(); await closeConnection(); throw error;
        } finally { starting = false; }
      },
      async cancel() {
        if (closed || !turn) return;
        turn.cancelled = true;
        await interrupt(turn); // pending starts are cancelled when turn/started arrives.
      },
      async close() { closed = true; clearTurn(); await closeConnection(); },
    };
  } catch (error) { closed = true; await closeConnection(); throw error; }
}
