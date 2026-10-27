import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);
const client = { name: 'dreamcut-owned-eval-client', version: '2' };
const statePath = dir => path.join(dir, 'connection.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function daemon(dir) {
  const events = [];
  let runId;
  const receiptPath = path.join(dir, 'client-receipt.json');
  const record = event => {
    events.push({ ...event, at: new Date().toISOString() });
    fs.writeFileSync(receiptPath, JSON.stringify({ client, run_id: runId, scope: 'Owned client bridge; not native Codex MCP refresh.', events }, null, 2), { mode: 0o600 });
  };
  const probe = spawn(process.execPath, [path.join(path.dirname(self), 'client-refresh-probe.mjs'), 'serve', path.join(dir, 'probe-receipt.json'), 'editing'], { stdio: ['pipe', 'pipe', 'inherit'] });
  let nextId = 0, dirty = false, calls = 0, stopped = false;
  let registered = new Map();
  const pending = new Map();
  let server;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(lifetime);
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Client stopped')); }
    pending.clear();
    probe.stdin.end();
    probe.kill();
    server?.closeAllConnections();
    server?.close();
    if (fs.existsSync(statePath(dir))) fs.unlinkSync(statePath(dir));
  };
  const lifetime = setTimeout(() => { record({ kind: 'timeout' }); stop(); }, 120000);
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  probe.on('error', error => { record({ kind: 'runtime_error', message: error.message }); stop(); });
  probe.on('exit', () => { if (!stopped) { record({ kind: 'runtime_error', message: 'Probe exited' }); stop(); } });
  probe.stdin.on('error', error => { if (!stopped) { record({ kind: 'runtime_error', message: error.message }); stop(); } });
  createInterface({ input: probe.stdout }).on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { record({ kind: 'runtime_error', message: 'Invalid probe response' }); stop(); return; }
    if (message.method === 'notifications/tools/list_changed') { dirty = true; record({ kind: 'list_changed' }); }
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer); pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  });
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('MCP request timeout')); }, 15000);
    pending.set(id, { resolve, reject, timer });
    probe.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const refresh = async () => {
    dirty = false;
    const result = await rpc('tools/list');
    registered = new Map(result.tools.map(tool => [tool.name, tool]));
    record({ kind: 'registered', count: registered.size, names: [...registered.keys()] });
  };
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: client });
  runId = JSON.parse(fs.readFileSync(path.join(dir, 'probe-receipt.json'), 'utf8')).run_id;
  probe.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  await refresh();
  const secret = randomBytes(32).toString('hex');
  let queue = Promise.resolve();
  const handle = async request => {
    if (dirty && request.action !== 'stop') await refresh();
    if (request.action === 'list') return { client, tools: [...registered.values()], count: registered.size };
    if (request.action === 'stop') { setTimeout(stop, 50); return { stopped: true }; }
    if (request.action !== 'call') throw new Error('Unknown action');
    const { tool, arguments: args = {} } = request;
    if (++calls > 15) { record({ kind: 'rejected', reason: 'Call budget exceeded' }); throw new Error('15-call budget exceeded'); }
    if (!registered.has(tool)) {
      record({ kind: 'rejected', tool, reason: 'Tool not registered' });
      throw new Error('Tool not registered. Discover and load its family first.');
    }
    const allowed = (tool === 'capability_catalog' && (['search', 'get'].includes(args.action ?? 'search') || (args.action === 'load' && args.id === 'cutout-preparation'))) ||
      (tool === 'cutout_status' && args.project_id === 'refresh-probe' && args.job_id === 'probe-job');
    if (!allowed) { record({ kind: 'rejected', tool, reason: 'Outside eval allowlist' }); throw new Error('Only catalog discovery/cutout family loading and synthetic refresh-probe/probe-job status are allowed.'); }
    record({ kind: 'dispatch', tool, arguments: args });
    const result = await rpc('tools/call', { name: tool, arguments: args });
    const refreshed = dirty || (tool === 'capability_catalog' && args.action === 'load' && !result.isError);
    if (refreshed) await refresh();
    record({ kind: 'result', tool, result, registered_count: registered.size });
    return { client, result, registered_count: registered.size, ...(refreshed ? { tools: [...registered.values()] } : {}) };
  };
  server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method !== 'POST' || req.url !== '/' || req.headers.authorization !== `Bearer ${secret}`) { res.writeHead(403).end('{}'); return; }
    try {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 20000) throw new Error('Request too large'); }
      const request = JSON.parse(raw);
      const task = queue.then(() => handle(request)); queue = task.catch(() => {});
      res.end(JSON.stringify(await task));
    } catch (error) { res.writeHead(400).end(JSON.stringify({ error: error.message })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  // Publish complete: the starter polls for this file, so it must never be seen half-written.
  const unpublished = `${statePath(dir)}.${process.pid}`;
  fs.writeFileSync(unpublished, JSON.stringify({ port: server.address().port, secret, pid: process.pid }), { flag: 'wx', mode: 0o600 });
  try { fs.linkSync(unpublished, statePath(dir)); } finally { fs.unlinkSync(unpublished); }
}

async function main() {
  const [command, directory, tool, raw = '{}'] = process.argv.slice(2);
  if (!directory || !['start', 'daemon', 'list', 'call', 'stop'].includes(command)) throw new Error('Usage: progressive-eval-client.mjs start|list|stop <run-dir> | call <run-dir> <tool> <json>');
  const dir = path.resolve(directory);
  if (command === 'daemon') return daemon(dir);
  if (command === 'start') {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const reservation = fs.openSync(path.join(dir, '.started'), 'wx', 0o600); fs.closeSync(reservation);
    const log = fs.openSync(path.join(dir, 'daemon.log'), 'a', 0o600);
    const child = spawn(process.execPath, [self, 'daemon', dir], { detached: true, stdio: ['ignore', log, log] });
    fs.closeSync(log); child.unref();
    for (let attempt = 0; attempt < 100 && !fs.existsSync(statePath(dir)); attempt++) await sleep(100);
    if (!fs.existsSync(statePath(dir))) throw new Error('Client startup failed; inspect daemon.log');
  }
  const state = JSON.parse(fs.readFileSync(statePath(dir), 'utf8'));
  const response = await fetch(`http://127.0.0.1:${state.port}/`, { method: 'POST', headers: { authorization: `Bearer ${state.secret}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: command === 'start' ? 'list' : command, tool, arguments: JSON.parse(raw) }), signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  console.log(JSON.stringify(result));
  if (!response.ok) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === self) main().catch(error => { console.error(error.message); process.exitCode = 1; });
