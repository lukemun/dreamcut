import { createLlamaAdapter } from '../../mcp/harness-llama.mjs';

/**
 * Tool-only local-model adapter with the same contract as runCodexToolTrial: the caller supplies
 * the tool boundary and `dispatch`; this loop only relays model tool calls to it. The model
 * service is an already running loopback llama-server (OpenAI-compatible chat completions).
 */
export async function runLocalToolTrial({ endpoint, model, instructions, prompt, tools, dispatch, onEvent = (_event) => {},
  timeoutMs = 600000, maxToolCalls = 30, maxModelCalls = 24, maxOutput = 4096, contextLimit = 32768, temperature = 0, thinking = false }) {
  const usage = { prompt_tokens: 0, completion_tokens: 0, model_calls: 0, missing_usage: 0 };
  const adapter = createLlamaAdapter({ endpoint, model, maxOutput, contextLimit, temperature, thinking, timeoutMs: Math.min(timeoutMs, 300000), maxStringLength: 4096,
    onEvent: event => {
      if (event.kind === 'model_response') {
        usage.model_calls++;
        if (event.usage) { usage.prompt_tokens += event.usage.prompt_tokens ?? 0; usage.completion_tokens += event.usage.completion_tokens ?? 0; } else usage.missing_usage++;
        // Same shape as the Codex runner's usage event, so a timed-out trial still records usage.
        onEvent({ method: 'thread/tokenUsage/updated', params: { tokenUsage: { ...usage } } });
      }
      onEvent(event);
    } });
  const deadline = AbortSignal.timeout(timeoutMs);
  const providerTools = tools.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));
  const messages = [{ role: 'system', content: instructions }, { role: 'user', content: prompt }];
  let toolCalls = 0;
  for (let call = 0; call < maxModelCalls; call++) {
    if (deadline.aborted) throw new Error('Trial timed out');
    const message = await adapter.chat({ messages, tools: providerTools, signal: deadline });
    messages.push({ role: 'assistant', content: message.content ?? '', ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}) });
    if (!message.tool_calls?.length) return { model, toolCalls, usage, final: message.content ?? '', status: 'completed' };
    for (const toolCall of message.tool_calls) {
      if (++toolCalls > maxToolCalls) throw new Error('Tool-call budget exceeded');
      let content;
      try {
        const name = toolCall.function?.name;
        if (!tools.some(tool => tool.name === name)) throw new Error('Tool is not allowlisted');
        const raw = toolCall.function?.arguments;
        const args = typeof raw === 'string' ? (raw.trim() ? JSON.parse(raw) : {}) : (raw ?? {});
        content = JSON.stringify(await dispatch(name, args));
      } catch (error) { content = JSON.stringify({ error: String(error?.message ?? error) }); }
      onEvent({ kind: 'tool_result', name: toolCall.function?.name, bytes: content.length });
      messages.push({ role: 'tool', tool_call_id: toolCall.id, content });
    }
  }
  return { model, toolCalls, usage, final: '', status: 'model_call_budget_exhausted' };
}
