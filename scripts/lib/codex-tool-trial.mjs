import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { readEnv } from '../../mcp/env-name.mjs';

/** Tool-only Codex adapter. The caller supplies a private, clean Codex home and tool boundary. */
export async function runCodexToolTrial({ cwd, codexHome, model, instructions, prompt, tools, dispatch, onEvent = (_event) => {}, timeoutMs = 600000, maxToolCalls = 30 }) {
  const child = spawn(readEnv("CODEX_EXECUTABLE") ?? 'codex', ['app-server', '--stdio'], {
    cwd, env: { ...process.env, CODEX_HOME: codexHome }, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32',
  });
  let id = 0, toolCalls = 0, stderr = '', finished = false;
  const pending = new Map();
  let complete, fail;
  const completion = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
  // Attach immediately so a startup failure cannot create an unhandled rejection.
  completion.catch(() => {});
  const send = value => child.stdin.write(JSON.stringify(value) + '\n');
  const request = (method, params) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); send({ id: key, method, params }); });
  const stop = () => { try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {} };
  const abort = error => { for (const item of pending.values()) item.reject(error); pending.clear(); fail(error); stop(); };
  const timer = setTimeout(() => abort(new Error('Trial timed out')), timeoutMs);
  child.on('error', abort);
  child.on('exit', code => { if (!finished) abort(new Error(`Codex exited (${code}): ${stderr.slice(-1000)}`)); });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
  child.stdin.on('error', () => {});
  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', async line => {
    try {
      const msg = JSON.parse(line);
      onEvent(msg);
      if (msg.id !== undefined && !msg.method) {
        const waiter = pending.get(msg.id); pending.delete(msg.id);
        if (waiter) msg.error ? waiter.reject(new Error(JSON.stringify(msg.error))) : waiter.resolve(msg.result);
      } else if (msg.id !== undefined) {
        if (msg.method !== 'item/tool/call') { send({ id: msg.id, error: { code: -32601, message: 'Not allowed in this trial' } }); return; }
        if (++toolCalls > maxToolCalls) throw new Error('Tool-call budget exceeded');
        let result;
        try {
          if (!tools.some(tool => tool.name === msg.params.tool)) throw new Error('Tool is not allowlisted');
          result = { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify(await dispatch(msg.params.tool, msg.params.arguments)) }] };
        } catch (error) { result = { success: false, contentItems: [{ type: 'inputText', text: String(error.message ?? error) }] }; }
        send({ id: msg.id, result });
      } else if (msg.method === 'turn/completed') complete(msg.params);
    } catch (error) { abort(error); }
  });
  try {
    await request('initialize', { clientInfo: { name: 'dreamcut_eval', title: 'DreamCut evaluation', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    send({ method: 'initialized', params: {} });
    const started = await request('thread/start', {
      model, allowProviderModelFallback: false, cwd, ephemeral: true, environments: [], runtimeWorkspaceRoots: [],
      approvalPolicy: 'never', sandbox: 'read-only', baseInstructions: instructions,
      dynamicTools: tools.map(tool => ({ type: 'function', ...tool })),
      config: { web_search: 'disabled', model_reasoning_effort: 'medium', features: { shell_tool: false, unified_exec: false, apps: false, plugins: false, multi_agent: false, browser_use: false, computer_use: false, image_generation: false, memories: false, hooks: false, code_mode: false } },
    });
    if (started.model !== model) throw new Error(`Requested ${model}, received ${started.model}; refusing model fallback`);
    await request('turn/start', { threadId: started.thread.id, environments: [], input: [{ type: 'text', text: prompt }] });
    const result = await completion;
    if (result.turn?.status !== 'completed') throw new Error(result.turn?.error?.message ?? `Turn ${result.turn?.status}`);
    return { model: started.model, threadId: started.thread.id, toolCalls, completion: result };
  } finally { finished = true; clearTimeout(timer); for (const item of pending.values()) item.reject(new Error('Trial closed')); lines.close(); stop(); }
}
