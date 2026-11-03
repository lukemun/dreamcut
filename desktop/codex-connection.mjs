import { createWorkerOwner } from './owned-workers.mjs';
import { createWorkerCrashGuard } from './worker-crash-guard.mjs';

// Host-only transport. Never expose this generic request method through renderer
// IPC: the editing adapter must impose project/tool/permission boundaries first.
export async function connectCodex(executable, { env = process.env, cwd, timeoutMs = 15000,
  args = ['app-server', '--listen', 'stdio://'], experimentalApi = false, onNotification = () => {}, onDisconnect = () => {}, onToolCall } = {}) {
  let failConnection = () => {};
  const crashGuard = await createWorkerCrashGuard({ onFailure: () => failConnection(Error('Codex process cleanup became unavailable.')) });
  const owner = createWorkerOwner({ onStarted: pid => crashGuard.started(pid), onExited: pid => crashGuard.exited(pid) });
  const stop = () => owner.stop().finally(() => crashGuard.close());
  let child;
  try { child = owner.spawn(executable, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (error) { await stop(); throw error; }
  const pending = new Map();
  const hostRequests = new Set();
  let toolActive = false;
  let nextId = 1, buffer = '', ended = false;
  const fail = error => {
    if (ended) return;
    ended = true;
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    pending.clear();
    void stop();
    try { onDisconnect(); } catch { /* Observers cannot prevent process cleanup. */ }
  };
  failConnection = fail;
  const send = message => {
    if (ended) throw Error('Codex connection is closed.');
    child.stdin.write(JSON.stringify(message) + '\n');
  };
  child.stdin.on('error', () => fail(Error('Codex input closed.')));
  child.stderr.resume(); // Do not forward account data, prompts or paths into app logs.
  child.once('error', () => fail(Error('The installed Codex executable could not start.')));
  child.once('exit', () => fail(Error('Codex stopped. Reconnect before continuing.')));
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    if (Buffer.byteLength(buffer) > 4 * 1024 * 1024) { fail(Error('Codex response exceeded the transport limit.')); return; }
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0 && !ended) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch { fail(Error('Codex returned malformed protocol data.')); return; }
      if (!message || typeof message !== 'object' || Array.isArray(message)) { fail(Error('Codex returned invalid protocol data.')); return; }
      if (message.method && message.id != null) {
        // Only a host-installed editing handler can dispatch dynamic tools. All
        // approvals, credential requests and other host actions remain denied.
        if (message.method !== 'item/tool/call' || typeof onToolCall !== 'function') {
          send({ id: message.id, error: { code: -32601, message: 'This host action is not enabled.' } });
        } else if (hostRequests.has(message.id) || hostRequests.size >= 1024 || toolActive) {
          send({ id: message.id, error: { code: -32600, message: 'Duplicate, overlapping or excess host request.' } });
        } else {
          hostRequests.add(message.id); toolActive = true;
          // The handler owns scope validation and durable dispatch journaling.
          // A thrown error is an unknown outcome, not permission to retry.
          Promise.resolve().then(() => ended ? null : onToolCall(message.params)).then(result => {
            if (!ended) send({ id: message.id, result });
          }).catch(() => {
            if (!ended) send({ id: message.id, error: { code: -32603, message: 'Tool outcome unavailable; do not retry automatically.' } });
          }).finally(() => { toolActive = false; });
        }
      } else if (message.id != null) {
        const entry = pending.get(message.id);
        if (!entry) continue;
        pending.delete(message.id); clearTimeout(entry.timer);
        if (message.error) {
          const error = Error(`Codex request failed (${message.error.code ?? 'unknown'}).`);
          Object.defineProperty(error, 'protocolMessage', { value: String(message.error.message || '') });
          entry.reject(error);
        }
        else if ('result' in message) entry.resolve(message.result);
        else entry.reject(Error('Codex response is missing its result.'));
      } else if (typeof message.method === 'string') {
        try { onNotification(message.method, message.params); }
        catch { fail(Error('Codex event handling failed.')); }
      }
    }
  });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    if (ended) { reject(Error('Codex connection is closed.')); return; }
    if (pending.size >= 32) { reject(Error('Too many pending Codex requests.')); return; }
    const id = nextId++;
    const timer = setTimeout(() => fail(Error('Codex request timed out; reconnect before retrying.')), timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try { send({ id, method, params }); } catch { fail(Error('Could not send the Codex request.')); }
  });
  try {
    const initialized = await request('initialize', { clientInfo: { name: 'dreamcut', title: 'DreamCut', version: '0.1.0' }, capabilities: { experimentalApi } });
    send({ method: 'initialized', params: {} });
    return {
      initialized,
      request,
      async close() { fail(Error('Codex connection closed.')); await stop(); },
    };
  } catch (error) { fail(error); await stop(); throw error; }
}
