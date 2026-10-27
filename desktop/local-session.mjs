import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createEditingToolBridge } from './codex-tool-bridge.mjs';
import { acquireProjectLease, assertProjectLease } from './project-lease.mjs';
import { readEnv } from '../mcp/env-name.mjs';

export const LOCAL_MODEL_LABELS = { qwen: 'Qwen3.6 35B A3B', ministral: 'Ministral 3 14B', glimmer: 'Muse Glimmer 30B', flint: 'Flint 40B A2.5B' };
// Default order from the 2026-10-10 bake-off (docs/architecture/editing-operator-runbook.md): Ministral
// was the most reliable at interactive speed; Glimmer was as accurate but ~7x slower; Qwen broke the proposal format.
const PREFERRED = ['ministral', 'glimmer', 'qwen'];
export const defaultLocalModel = (installed = [], override) => installed.includes(override) ? override : PREFERRED.find(name => installed.includes(name)) ?? installed[0];
const CONTEXT = 65536;
const IDLE_STOP_MS = 15 * 60_000;

/**
 * One local model server for the whole host: models are large, so only one is loaded at a time,
 * shared by every window, and stopped after a quiet period or when the app quits.
 */
const host = { current: undefined, starting: undefined, users: 0, idle: undefined };
export async function acquireLocalModel(name, { harnessRoot, binary, env = process.env }) {
  // The same model folder discovery listed from (DREAMCUT_LOCAL_MODEL_ROOT), or the default.
  const modelRoot = readEnv("LOCAL_MODEL_ROOT", env);
  clearTimeout(host.idle);
  host.users++;
  try {
    while (host.starting) await host.starting.catch(() => {});
    if (host.current?.name === name) return host.current;
    host.starting = (async () => {
      if (host.current) { const previous = host.current; host.current = undefined; await previous.stop(); }
      const { serveLocalModel } = await import(pathToFileURL(path.join(harnessRoot, 'mcp/local-model-suite.mjs')).href);
      // Interactive start: a size check; qualification and evals hash the weights.
      host.current = await serveLocalModel(name, { binary, context: CONTEXT, verify: false, ...(modelRoot ? { modelRoot } : {}) });
      return host.current;
    })();
    try { return await host.starting; } finally { host.starting = undefined; }
  } catch (error) { releaseLocalModel(); throw error; }
}
export function releaseLocalModel() {
  host.users = Math.max(0, host.users - 1);
  if (host.users || !host.current) return;
  host.idle = setTimeout(() => { if (!host.users) void stopLocalModel(); }, IDLE_STOP_MS);
  host.idle.unref?.();
}
export async function stopLocalModel() {
  clearTimeout(host.idle);
  const current = host.current; host.current = undefined;
  if (current) await current.stop();
}

/** Parse an OpenAI-compatible server-sent event stream into JSON chunks. */
async function* streamChunks(response) {
  const decoder = new TextDecoder(); let buffer = '';
  for await (const bytes of response.body) {
    buffer += decoder.decode(bytes, { stream: true });
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try { yield JSON.parse(data); } catch { /* Partial or foreign line. */ }
    }
  }
}

// A text-only model (no projector) gets a note in place of each image, which its server could not read.
export const toolMessage = (id, result, vision = true) => {
  const blocks = Array.isArray(result?.content) ? result.content : [];
  const images = blocks.filter(block => block.type === 'image' && block.data && block.mimeType);
  const notes = !vision && images.length ? [`${images.length} image(s) omitted: this model cannot read images.`] : [];
  const text = JSON.stringify({ isError: result?.isError === true, content: [...blocks.filter(block => block.type === 'text').map(block => block.text), ...notes] });
  return { role: 'tool', tool_call_id: id, content: vision && images.length
    ? [{ type: 'text', text }, ...images.map(image => ({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } }))] : text };
};

// Host-owned local session with the same contract as the Codex and Claude sessions: the renderer
// cannot choose tools, paths or permissions. Every tool call goes through the shared journaled
// editing bridge; the model only sees DreamCut's editing tools.
export async function openLocalSession({ executable, projectDirectory, env, editing, projectLease, developerInstructions, onEvent = () => {},
  models: installed = [], defaultModel, harnessRoot, acquire = acquireLocalModel, release = releaseLocalModel, fetchImpl = fetch,
  turnTimeoutMs = 600000, maxModelCalls = 30, maxToolCalls = 40, maxOutput = 4096, prewarmOnOpen = true }) {
  if (!installed.length) throw Error('No local models are installed.');
  const { toProviderTools } = await import(pathToFileURL(path.join(harnessRoot, 'mcp/harness-adapters.mjs')).href);
  const { compactToolContent } = await import(pathToFileURL(path.join(harnessRoot, 'mcp/harness-context.mjs')).href);
  let releaseLease = () => {}, closed = false, turn, held;
  const threadId = randomUUID();
  const emit = event => { try { onEvent(event); } catch { /* UI listeners cannot change session authority. */ } };
  if (projectLease) assertProjectLease(projectDirectory, projectLease);
  else { const owned = acquireProjectLease(projectDirectory); releaseLease = () => owned.release(); }
  const bridge = await createEditingToolBridge({ ...editing, provider: 'local', onActivity: value => { if (turn) emit({ type: 'tool', ...value }); },
    scope: () => ({ threadId, turnId: turn?.id, active: !closed && Boolean(turn) && !turn.cancelled }) });
  // Generation-only projection measured on 2026-10-10: full schemas cost ~60K prompt tokens and
  // long string/regex constraints break llama.cpp's grammar; this keeps ~11K tokens and every tool
  // parses. The bridge still validates each call against the full schema and returns exact errors.
  const tools = toProviderTools(bridge.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })), { maxStringLength: 1000, maxSchemaDepth: 5, dropPatterns: true });
  const choices = installed.map(name => ({ model: name, label: LOCAL_MODEL_LABELS[name] ?? name, isDefault: name === defaultLocalModel(installed, defaultModel) }));
  let current = choices.find(item => item.isDefault)?.model ?? installed[0];
  // The conversation lives for this session; DreamCut's transcript seeds a fresh one as context.
  const messages = [{ role: 'system', content: developerInstructions ?? '' }];

  const runTurn = async active => {
    const server = held;
    let modelCalls = 0, toolCalls = 0;
    for (;;) {
      if (active.cancelled) return 'interrupted';
      if (++modelCalls > maxModelCalls) throw Error('The local model used its step limit for this message without finishing.');
      const response = await fetchImpl(new URL('/v1/chat/completions', server.endpoint), { method: 'POST', headers: { 'content-type': 'application/json' }, redirect: 'error', signal: active.abort.signal,
        body: JSON.stringify({ model: server.alias, messages, tools, stream: true, temperature: 0.3, max_tokens: maxOutput, chat_template_kwargs: { enable_thinking: false } }) });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        const message = detail.error?.message ?? `HTTP ${response.status}`;
        throw Error(/context|too long|exceed/i.test(message) ? 'This conversation no longer fits the local model. Start a new chat.' : `Local model error: ${message}`);
      }
      let content = '', reasoning = false, finish;
      const calls = [];
      for await (const chunk of streamChunks(response)) {
        const choice = chunk.choices?.[0]; if (!choice) continue;
        const delta = choice.delta ?? {};
        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
          if (!reasoning) { reasoning = true; emit({ type: 'reasoning-start' }); }
          emit({ type: 'reasoning', text: delta.reasoning_content });
        }
        if (typeof delta.content === 'string' && delta.content) {
          if (!content && active.wroteText) emit({ type: 'text', text: '\n\n' });
          content += delta.content; active.wroteText = true; emit({ type: 'text', text: delta.content });
        }
        for (const part of delta.tool_calls ?? []) {
          const slot = calls[part.index ?? calls.length] ??= { id: part.id ?? `call_${randomUUID()}`, name: '', arguments: '' };
          if (part.id) slot.id = part.id;
          if (part.function?.name) slot.name += part.function.name;
          if (part.function?.arguments) slot.arguments += part.function.arguments;
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      }
      const toolCallsHere = calls.filter(Boolean);
      messages.push({ role: 'assistant', content, ...(toolCallsHere.length ? { tool_calls: toolCallsHere.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments || '{}' } })) } : {}) });
      if (!toolCallsHere.length) {
        if (finish === 'length') throw Error('The local model reached its reply length limit.');
        return 'completed';
      }
      for (const call of toolCallsHere) {
        if (active.cancelled) { messages.push(toolMessage(call.id, { isError: true, content: [{ type: 'text', text: 'Not run: the creator stopped this response.' }] })); continue; }
        if (++toolCalls > maxToolCalls) throw Error('The local model used its tool limit for this message.');
        let args;
        try { args = call.arguments.trim() ? JSON.parse(call.arguments) : {}; }
        catch { messages.push(toolMessage(call.id, { isError: true, content: [{ type: 'text', text: 'Arguments were not valid JSON. Nothing was run.' }] })); continue; }
        const result = await bridge.call({ threadId, turnId: active.id, callId: call.id, tool: call.name, arguments: args });
        // The bridge journals the full result; the model reads a compact copy (measured: timeline_get
        // on a 7-clip project fell from ~30K to a few thousand tokens without waveform samples and indentation).
        messages.push(toolMessage(call.id, { ...result, content: compactToolContent(call.name, result?.content) }, server.vision !== false));
      }
    }
  };

  // Load (and switch) the served model; one load at a time. Status events let the chat show progress.
  let loading;
  const ensureModel = name => {
    if (held?.name === name) return Promise.resolve(held);
    const previous = loading ?? Promise.resolve();
    loading = previous.catch(() => {}).then(async () => {
      if (closed) throw Error('Session is closed.');
      if (held?.name === name) return held;
      if (held) { held = undefined; release(); }
      emit({ type: 'model-status', state: 'loading', model: name, label: LOCAL_MODEL_LABELS[name] ?? name });
      try { held = await acquire(name, { harnessRoot, binary: executable, env }); }
      catch (error) { emit({ type: 'model-status', state: 'failed', model: name, label: LOCAL_MODEL_LABELS[name] ?? name }); throw error; }
      return held;
    });
    return loading;
  };
  // Prewarm: load the model and process the fixed prefix (instructions and tool list) into
  // llama.cpp's prompt cache, so the first message only processes the new text.
  const prewarm = async name => {
    if (closed || turn) return;
    const server = await ensureModel(name);
    try {
      await fetchImpl(new URL('/v1/chat/completions', server.endpoint), { method: 'POST', headers: { 'content-type': 'application/json' }, redirect: 'error',
        body: JSON.stringify({ model: server.alias, messages: [messages[0], { role: 'user', content: '.' }], tools, max_tokens: 1, cache_prompt: true, chat_template_kwargs: { enable_thinking: false } }) });
    } catch { /* Warming is best effort; the first message processes the prefix instead. */ }
    if (!closed && held === server) emit({ type: 'model-status', state: 'ready', model: server.name, label: LOCAL_MODEL_LABELS[server.name] ?? server.name });
  };
  if (prewarmOnOpen) void prewarm(current).catch(() => {});

  return {
    async models() { if (closed) throw Error('Session is closed.'); return { models: choices, selected: current }; },
    /** Start loading a model ahead of the first message, e.g. when it is chosen in the picker. */
    async prewarm(model) {
      if (model !== undefined && !installed.includes(model)) throw Error('Choose an installed local model.');
      if (model !== undefined) current = model;
      void prewarm(current).catch(() => {});
    },
    async send(text, model) {
      if (closed) throw Error('Session is closed.');
      if (turn) throw Error('Wait for the current response before sending another message.');
      if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 64000) throw Error('Message must contain between 1 and 64000 bytes.');
      if (model !== undefined && !installed.includes(model)) throw Error('Choose an installed local model.');
      const active = { id: randomUUID(), cancelled: false, wroteText: false, abort: new AbortController() };
      turn = active;
      emit({ type: 'started' });
      try {
        current = model ?? current;
        await ensureModel(current);
      } catch (error) { turn = undefined; throw error; }
      const timer = setTimeout(() => { active.timedOut = true; active.cancelled = true; active.abort.abort(); }, turnTimeoutMs);
      timer.unref?.();
      messages.push({ role: 'user', content: text });
      // The turn runs after send resolves, like the other agents; events report its outcome.
      void runTurn(active).then(status => emit({ type: 'completed', status: active.timedOut ? 'failed' : status }), error => {
        if (active.cancelled && !active.timedOut) { emit({ type: 'completed', status: 'interrupted' }); return; }
        emit({ type: 'error', message: active.timedOut ? 'The response exceeded its time limit.' : error?.message ?? 'The local model stopped.' });
        emit({ type: 'completed', status: 'failed' });
      }).finally(() => { clearTimeout(timer); if (turn === active) turn = undefined; });
    },
    async cancel() {
      if (closed || !turn || turn.cancelled) return;
      // A tool already dispatched finishes and is journaled; no further tool is dispatched.
      turn.cancelled = true; turn.abort.abort();
    },
    async close() {
      if (closed) return;
      closed = true;
      if (turn) { turn.cancelled = true; turn.abort.abort(); }
      if (held) { held = undefined; release(); }
      releaseLease();
    },
  };
}
