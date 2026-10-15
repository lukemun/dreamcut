import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { codexSessionStore } from './codex-session-store.mjs';
import { createEditingToolBridge } from './codex-tool-bridge.mjs';
import { acquireProjectLease, assertProjectLease } from './project-lease.mjs';

const SERVER = 'dreamcut';
const HISTORY_LIMIT = 200;
// Subscription only: an inherited key would silently bill an API account instead.
const CREDENTIAL_ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'];
const KEY_SOURCES = new Set(['ANTHROPIC_API_KEY', 'apiKeyHelper']);
const AUTH_ERRORS = { authentication_failed: 'Claude is signed out. Sign in to Claude, then send your message again.',
  oauth_org_not_allowed: 'This Claude account cannot be used here.', account_on_hold: 'This Claude account is on hold.',
  billing_error: 'Claude reported a billing problem with this account.', rate_limit: 'Claude usage limit reached. Try again later.' };

function messageQueue() {
  const items = []; let wake, ended = false;
  return {
    push(item) { items.push(item); wake?.(); },
    end() { ended = true; wake?.(); },
    async *[Symbol.asyncIterator]() {
      for (;;) {
        if (items.length) { yield items.shift(); continue; }
        if (ended) return;
        await new Promise(resolve => { wake = resolve; });
        wake = undefined;
      }
    },
  };
}

const visibleText = message => {
  const content = message?.content;
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n\n') : '';
};

// Host-owned Claude Code session through the Agent SDK. Mirrors openCodexSession:
// the renderer cannot choose tools, paths, permissions or credentials. Claude Code
// runs with no built-in tools, no user/project settings and one in-process MCP
// server whose calls go through the shared journaled editing bridge.
export async function openClaudeSession({ executable, projectDirectory, userData, env, editing, projectLease, developerInstructions, onEvent = () => {},
  sdk, turnTimeoutMs = 300000, startupTimeoutMs = 60000, persist = true }) {
  if (!Number.isFinite(turnTimeoutMs) || turnTimeoutMs <= 0 || turnTimeoutMs > 300000) throw Error('Invalid response time limit.');
  sdk ??= await import('@anthropic-ai/claude-agent-sdk');
  const project = await fs.realpath(projectDirectory);
  let query, sessionId, turn, closed = false, pump, pendingTool;
  let releaseLease = () => {}, closing;
  const queue = messageQueue();
  const abort = new AbortController();
  const emit = event => { try { onEvent(event); } catch { /* UI listeners cannot change session authority. */ } };
  const clearTurn = () => { if (turn) clearTimeout(turn.timer); turn = undefined; };
  const closeConnection = () => {
    if (!closing) closing = (async () => {
      try {
        queue.end(); abort.abort();
        try { query?.close?.(); } catch { /* Already stopped. */ }
        if (pendingTool) await pendingTool.catch(() => {});
        if (pump) await pump.catch(() => {});
      } finally { releaseLease(); }
    })();
    return closing;
  };
  const disconnected = message => {
    if (closed) return;
    closed = true; clearTurn();
    emit({ type: 'disconnected', message: message ?? 'Claude disconnected. Reconnect before sending another message.' });
    void closeConnection();
  };
  try {
    if (projectLease) assertProjectLease(project, projectLease);
    else { const owned = acquireProjectLease(project); releaseLease = () => owned.release(); }
    if (editing?.journal.snapshot().operations.some(operation => ['pending', 'unknown'].includes(operation.status))) {
      throw Error('An earlier editing tool outcome needs reconciliation before reconnecting.');
    }
    const bridge = editing ? await createEditingToolBridge({ ...editing, provider: 'claude', onActivity: value => { if (turn) emit({ type: 'tool', ...value }); },
      scope: () => ({ threadId: sessionId, turnId: turn?.id, active: !closed && Boolean(turn?.active) && !turn.cancelled }) }) : null;
    const toolsHash = bridge ? createHash('sha256').update(JSON.stringify(bridge.tools)).digest('hex') : null;
    const allowedTools = (bridge?.tools ?? []).map(tool => `mcp__${SERVER}__${tool.name}`);
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const { ListToolsRequestSchema, CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
    const server = new McpServer({ name: SERVER, version: '1.0.0' }, { capabilities: { tools: {} } });
    server.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: (bridge?.tools ?? []).map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) }));
    server.server.setRequestHandler(CallToolRequestSchema, async request => {
      if (!bridge) return { isError: true, content: [{ type: 'text', text: 'No editing tools are registered.' }] };
      pendingTool = bridge.call({ threadId: sessionId, turnId: turn?.id, callId: randomUUID(), tool: request.params.name, arguments: request.params.arguments ?? {} })
        .catch(error => { disconnected('An editing tool outcome needs review before continuing. No action was retried.'); throw error; });
      return pendingTool;
    });

    const key = createHash('sha256').update(project).digest('hex');
    // Claude Code keys its transcripts by working directory. An empty host-owned
    // folder keeps them out of the project; it has no file tools to reach it anyway.
    const workspace = path.join(userData, 'claude-workspaces', key);
    await fs.mkdir(workspace, { recursive: true, mode: 0o700 });
    // A delegated helper (persist: false) neither resumes nor replaces the conversation's saved session.
    const store = persist ? await codexSessionStore(userData, project, 'claude-sessions') : null;
    const saved = await store?.read();
    if (saved && (saved.toolsHash ?? null) !== toolsHash) throw Error('Saved session tools differ from this host; start a new conversation explicitly.');
    const agentEnv = { ...env };
    for (const name of CREDENTIAL_ENV) delete agentEnv[name];
    query = sdk.query({ prompt: queue, options: {
      abortController: abort, cwd: workspace, env: agentEnv,
      ...(executable ? { pathToClaudeCodeExecutable: executable } : {}),
      tools: [], allowedTools, permissionMode: 'dontAsk',
      canUseTool: async () => ({ behavior: 'deny', message: 'Only DreamCut editing tools are available in this session.' }),
      mcpServers: { [SERVER]: { type: 'sdk', name: SERVER, instance: server } }, strictMcpConfig: true, settingSources: [],
      systemPrompt: developerInstructions ?? '', includePartialMessages: true,
      // Summarized reasoning streams to the chat so the creator can follow the work and stop it.
      thinking: { type: 'adaptive', display: 'summarized' },
      ...(saved ? { resume: saved.threadId } : {}), ...(persist ? {} : { persistSession: false }), stderr: () => {},
    } });

    let timer;
    const init = await Promise.race([query.initializationResult(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Claude Code did not start in time.')), startupTimeoutMs); })])
      .finally(() => clearTimeout(timer));
    if (KEY_SOURCES.has(init.account?.apiKeySource)) throw Error('Claude Code is configured with an API key. DreamCut uses your Claude subscription sign-in only.');
    const choices = (init.models ?? []).filter(item => typeof item?.value === 'string' && typeof item.displayName === 'string')
      .map(item => ({ model: item.value, label: item.displayName, isDefault: item.value === 'default' }));
    if (!choices.length) throw Error('No Claude models are available.');
    let current = (choices.find(item => item.isDefault) ?? choices[0]).model;
    let ownershipSaved = Boolean(saved) || !store;
    if (saved) {
      sessionId = saved.threadId;
      const history = await sdk.getSessionMessages(saved.threadId, { dir: workspace, limit: HISTORY_LIMIT }).catch(() => []);
      // Claude Code's own notices (sign-in failures, "No response requested") are synthetic, not conversation.
      const messages = history.filter(item => item.parent_tool_use_id == null && (item.type === 'user' || item.type === 'assistant') && item.message?.model !== '<synthetic>')
        .map(item => ({ role: item.type, text: visibleText(item.message), ...(item.type === 'assistant' && typeof item.message?.model === 'string' ? { model: item.message.model } : {}) })).filter(item => item.text.trim());
      emit({ type: 'history', messages, truncated: history.length >= HISTORY_LIMIT });
    }

    const handle = message => {
      if (message.type === 'system' && message.subtype === 'init') {
        const external = message.tools.filter(name => !allowedTools.includes(name));
        const servers = message.mcp_servers.filter(item => item.name !== SERVER);
        if (external.length || servers.length || KEY_SOURCES.has(message.apiKeySource)) { disconnected('Claude Code session loaded tools or credentials outside DreamCut. Nothing was sent.'); return; }
        if (sessionId && sessionId !== message.session_id) { disconnected('Claude resumed a different session.'); return; }
        sessionId = message.session_id;
        if (!ownershipSaved) { ownershipSaved = true; void store.save(sessionId, toolsHash).catch(() => disconnected('Could not save conversation ownership.')); }
        return;
      }
      if (!turn) return;
      // The model that actually answered; "default" in the picker resolves to a specific model here.
      const answeredBy = message.type === 'assistant' && message.parent_tool_use_id == null ? message.message?.model : undefined;
      if (typeof answeredBy === 'string' && answeredBy !== '<synthetic>' && answeredBy !== turn.model) { turn.model = answeredBy; emit({ type: 'model', model: answeredBy }); }
      if (message.type === 'stream_event' && message.parent_tool_use_id == null) {
        const event = message.event;
        if (event.type === 'content_block_start' && event.content_block?.type === 'text' && turn.wroteText) emit({ type: 'text', text: '\n\n' });
        if (event.type === 'content_block_start' && event.content_block?.type === 'thinking') emit({ type: 'reasoning-start' });
        if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta' && typeof event.delta.thinking === 'string') emit({ type: 'reasoning', text: event.delta.thinking });
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') {
          turn.wroteText = true; emit({ type: 'text', text: event.delta.text });
        }
      } else if (message.type === 'assistant' && message.error) {
        turn.error = AUTH_ERRORS[message.error] ?? 'Claude could not complete the response.';
      } else if (message.type === 'result') {
        const { cancelled, error } = turn;
        clearTurn();
        if (error) emit({ type: 'error', message: error });
        emit({ type: 'completed', status: cancelled ? 'interrupted' : message.subtype === 'success' && !message.is_error ? 'completed' : 'failed' });
      }
    };
    pump = (async () => {
      try { for await (const message of query) { if (closed) break; handle(message); } }
      catch { /* Reported below as a disconnect. */ }
      finally { disconnected(); }
    })();

    return {
      async models() {
        if (closed) throw Error('Session is closed.');
        return { models: choices, selected: current };
      },
      async send(text, model) {
        if (closed) throw Error('Session is closed.');
        if (turn) throw Error('Wait for the current response before sending another message.');
        if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 64000) throw Error('Message must contain between 1 and 64000 bytes.');
        if (model !== undefined && !choices.some(item => item.model === model)) throw Error('Choose an available Claude model.');
        const active = { id: randomUUID(), active: true, cancelled: false, wroteText: false };
        turn = active;
        try {
          if (model !== undefined && model !== current) { await query.setModel(model === 'default' ? undefined : model); current = model; }
        } catch (error) { clearTurn(); throw error; }
        if (closed || turn !== active) throw Error('Session is closed.');
        active.timer = setTimeout(() => {
          if (turn === active) disconnected('The response exceeded its time limit. Reconnect to continue; the message was not retried.');
        }, turnTimeoutMs);
        active.timer.unref?.();
        // Typed messages are conversation text, never Claude Code slash commands.
        const content = text.startsWith('/') ? `​${text}` : text;
        queue.push({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: content }] }, parent_tool_use_id: null });
        emit({ type: 'started' });
      },
      async cancel() {
        if (closed || !turn || turn.cancelled) return;
        turn.cancelled = true;
        try { await query.interrupt(); }
        catch { emit({ type: 'error', message: 'Could not stop the response. Close the session to disconnect.' }); }
      },
      async close() { closed = true; clearTurn(); await closeConnection(); },
    };
  } catch (error) { closed = true; await closeConnection(); throw error; }
}
