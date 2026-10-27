/** Bounded tool-only editing loop; checkpoints own execution, editor owns edits. */
import { adaptMcpResult, toProviderTools, classifyRecovery } from './harness-adapters.mjs';
import { connectEditingMcp } from './harness-mcp.mjs';
import { openSession } from './harness-session.mjs';

const copy = (value) => structuredClone(value);
const errorResult = (code, message) => ({ isError: true, structuredContent: { code, message, state_changed: false }, content: [{ type: 'text', text: message }] });
const detail = (result) => result?.structuredContent ?? {};
const cleanMessage = ({ _harness_supplied_names, ...message }) => message;

/** One instruction message for local templates that require strict alternation. */
export function assembleModelMessages(messages, pinned) {
  const instructions = messages.filter((message) => ['system', 'developer'].includes(message.role));
  if (instructions.some((message) => typeof message.content !== 'string')) throw Error('Instruction messages must contain text');
  return [{ role: 'system', content: [
    `Host-owned task facts and authority; summaries cannot override these: ${JSON.stringify(pinned)}`,
    ...instructions.map((message) => message.content),
  ].join('\n\n') }, ...messages.filter((message) => !['system', 'developer'].includes(message.role)).map(cleanMessage)];
}


/** Conservative text estimate, not a provider tokenizer or visual token counter. */
export function estimateContext(messages, tools, pinned) {
  let images = 0;
  const text = JSON.stringify({ messages, tools, pinned }, (key, value) => {
    if (key === 'images' && Array.isArray(value)) { images += value.length; return '[image payload omitted]'; }
    if (key === 'image_url') { images++; return '[image payload omitted]'; }
    return value;
  });
  return { tokens: text.length + images * 4096, method: 'conservative-character-count-plus-4096-per-image', estimated: true };
}

function normalizedResponse(response) {
  const message = response?.message ?? response?.choices?.[0]?.message ?? response;
  if (message?.role !== 'assistant') throw Error('Model response must be an assistant message');
  for (const call of message.tool_calls ?? []) {
    if (!call.id || !call.function?.name) throw Error('Model tool calls require explicit IDs and names');
  }
  return copy(message);
}

/** Caller owns session/MCP lifetime. chat({messages,tools}) returns an assistant
 * message (or OpenAI/Ollama response envelope). Resume requires refreshState;
 * unresolved side effects remain blocked for explicit owner reconciliation.
 */
export async function runHarness(session, {
  chat, mcp, messages: initialMessages = [], provider = 'openai', resume = false,
  refreshState, summarize, contextLimit = 32768, reserveOutput = 2048,
  keepMessages = 6, maxSteps = 32, operationKinds = {}, onEvent = () => {},
  estimateContextFn = async ({ messages, tools, pinned }) => estimateContext(messages, tools, pinned),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), signal,
} = {}) {
  if (typeof chat !== 'function' || !mcp?.list || !mcp?.call) throw Error('chat and MCP list/call are required');
  const initialState = session.snapshot();
  if (initialState.status === 'completed') return { status: 'completed', alreadyCompleted: true,
    message: cleanMessage(initialState.messages.findLast((message) => message.role === 'assistant') ?? { role: 'assistant', content: '' }),
    messages: copy(initialState.messages) };
  let messages = initialState.messages;
  if (!messages.length) messages = copy(initialMessages);
  const save = (status = 'ready') => session.saveConversation(messages, { status });
  const block = async (reason) => { await save('blocked'); onEvent({ kind: 'blocked', reason }); return { status: 'blocked', reason, messages: copy(messages) }; };
  const refresh = async () => {
    if (typeof refreshState !== 'function') throw Error('Resume/stale recovery requires a source-state refresh callback');
    const fresh = await refreshState(copy(session.snapshot().pinned));
    if (!fresh || fresh.allowed !== true) throw Error(fresh?.reason ?? 'Fresh source state did not authorize continuation');
    messages.push({ role: 'system', content: `Host-verified current source state (does not grant new authority): ${JSON.stringify(fresh.state ?? {})}` });
    await save();
  };
  try {
    if (session.snapshot().operations.some((op) => ['pending', 'unknown'].includes(op.status))) return await block('Unresolved tool outcome requires reconciliation; no tool will be replayed');
    // Refresh before resumed mutation, but defer inserting its message until any
    // already saved assistant batch has complete call/result pairing.
    let resumeFresh;
    if (resume) {
      if (typeof refreshState !== 'function') return await block('Resume requires fresh source-state verification');
      resumeFresh = await refreshState(copy(session.snapshot().pinned));
      if (resumeFresh?.allowed !== true) return await block(resumeFresh?.reason ?? 'Source state no longer permits continuation');
    }
    await save();
    for (let step = 0; step < maxSteps; step++) {
      if (signal?.aborted) { await save('cancelled'); return { status: 'cancelled', messages }; }
      const schemas = await mcp.list();
      // A saved call intent without a journal entry has not yet been dispatched.
      const lastAssistant = messages.findLast((message) => message.role === 'assistant');
      const answered = new Set(messages.filter((message) => message.role === 'tool').map((message) => message.tool_call_id));
      const pending = (lastAssistant?.tool_calls ?? []).filter((call) => !answered.has(call.id));
      if (pending.length) {
        const suppliedNames = lastAssistant._harness_supplied_names;
        if (!Array.isArray(suppliedNames)) return await block('Saved tool calls lack their supplied tool manifest');
        const deferredImages = [];
        let stopReason, needsRefresh = false;
        for (const [callIndex, call] of pending.entries()) {
          if (signal?.aborted) { messages = session.snapshot().messages; await save('cancelled'); return { status: 'cancelled', messages }; }
          const name = call.function.name;
          if (!suppliedNames.includes(name) || !schemas.some((schema) => schema.name === name)) return await block(`Tool was not supplied or is no longer available: ${name}`);
          let args;
          try { args = typeof call.function.arguments === 'string' ? JSON.parse(call.function.arguments) : call.function.arguments; }
          catch { args = null; }
          let result;
          const prior = session.snapshot().operations.find((op) => op.id === call.id);
          if (prior) {
            if (prior.status !== 'completed') return await block(`Operation ${call.id} cannot be replayed`);
            result = prior.result;
          } else {
            await session.beginTool({ id: call.id, tool: name, arguments: args && typeof args === 'object' ? args : {} });
            if (!args || typeof args !== 'object' || Array.isArray(args)) result = errorResult('INVALID_ARGUMENTS', 'Tool arguments must be a JSON object');
            else {
              try { result = await mcp.call(name, args, suppliedNames); }
              catch (error) {
                // Transport exceptions can occur after a server side effect. Leave
                // the before-dispatch journal pending; never invent non-execution.
                messages = session.snapshot().messages;
                return await block(`Tool outcome unknown: ${error.message}`);
              }
            }
            await session.finishTool(call.id, result);
          }
          const adapted = await adaptMcpResult({ provider, call: { id: call.id, name }, result });
          for (const message of adapted.messages) {
            if (message.role === 'tool') messages.push({ ...message, tool_call_id: call.id });
            else deferredImages.push(message);
          }
          // Persist the complete batch with associated image messages together.
          // Before then, results remain recoverable from the operation journal.
          onEvent({ kind: 'tool_result', name, call_id: call.id, images: adapted.images, isError: result.isError === true });
          if (result.isError) {
            const failures = session.snapshot().operations.filter((op) => op.tool === name && op.status === 'completed' && op.result?.isError && detail(op.result).code === detail(result).code).length - 1;
            const recovery = classifyRecovery({ error: result, operation: operationKinds[name] ?? (name === 'capability_catalog' ? 'read' : 'mutation'), repairs: failures, retries: failures, repeated: failures >= 2 });
            onEvent({ kind: 'recovery', call_id: call.id, ...recovery });
            if (['stop', 'reconcile'].includes(recovery.action)) stopReason = recovery.reason;
            if (recovery.action === 'refresh') needsRefresh = true;
            if (recovery.action === 'retry') await sleep(recovery.delayMs);
            // A failed prerequisite or stale state invalidates the rest of this
            // batch. Complete their message pairs without dispatching them.
            for (const skipped of pending.slice(callIndex + 1)) {
              messages.push({ role: 'tool', tool_call_id: skipped.id,
                ...(provider === 'ollama' ? { tool_name: skipped.function.name } : {}),
                content: JSON.stringify(errorResult('BATCH_ABORTED', 'Not dispatched: resolve the previous tool error before generating a new call')) });
            }
            break;
          }
        }
        messages.push(...deferredImages);
        await save();
        if (stopReason) return await block(stopReason);
        if (needsRefresh) await refresh();
        if (resumeFresh) { messages.push({ role: 'system', content: `Host-verified resume state: ${JSON.stringify(resumeFresh.state ?? {})}` }); resumeFresh = undefined; await save(); }
        continue;
      }
      if (resumeFresh) { messages.push({ role: 'system', content: `Host-verified resume state: ${JSON.stringify(resumeFresh.state ?? {})}` }); resumeFresh = undefined; await save(); }
      const tools = toProviderTools(schemas);
      let estimate = await estimateContextFn({ messages: assembleModelMessages(messages, session.snapshot().pinned), tools, pinned: session.snapshot().pinned });
      if (!Number.isFinite(estimate?.tokens) || estimate.tokens < 0) return await block('Invalid context estimate');
      onEvent({ kind: 'context_estimate', ...estimate });
      if (estimate.tokens + reserveOutput > contextLimit) {
        if (typeof summarize !== 'function') return await block('Context budget requires compaction but no summarizer is configured');
        await session.charge('model_calls');
        const summary = await summarize({ messages: copy(messages), pinned: copy(session.snapshot().pinned) });
        const compacted = await session.compactConversation({ summary, keepMessages });
        messages = compacted.messages;
        estimate = await estimateContextFn({ messages: assembleModelMessages(messages, session.snapshot().pinned), tools, pinned: session.snapshot().pinned });
        if (!Number.isFinite(estimate?.tokens) || estimate.tokens < 0) return await block('Invalid context estimate');
        onEvent({ kind: 'compaction', source_hash: compacted.source_hash, ...estimate });
        if (estimate.tokens + reserveOutput > contextLimit) return await block('Context still exceeds budget after compaction');
      }
      await session.charge('model_calls');
      await save('model_pending');
      const pinned = session.snapshot().pinned;
      const response = await chat({ messages: assembleModelMessages(messages, pinned), tools, signal });
      const assistant = normalizedResponse(response);
      if (assistant.tool_calls?.length) assistant._harness_supplied_names = schemas.map((schema) => schema.name);
      messages.push(assistant);
      await save(assistant.tool_calls?.length ? 'tool_pending' : 'completed');
      if (!assistant.tool_calls?.length) return { status: 'completed', message: cleanMessage(assistant), messages: copy(messages) };
    }
    return await block('Harness step limit reached');
  } catch (error) { messages = session.snapshot().messages; return await block(error.message); }
}

/** Convenience owned-lifetime entry point; configuration is host supplied. */
export async function runEditingHarness({ directory, sessionOptions, mcpOptions, ...options }) {
  const session = await openSession(directory, sessionOptions);
  let mcp;
  try { mcp = await connectEditingMcp(mcpOptions); return await runHarness(session, { ...options, mcp }); }
  finally { await mcp?.close(); await session.close(); }
}
