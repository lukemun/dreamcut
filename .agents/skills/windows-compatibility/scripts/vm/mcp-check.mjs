// Connect to this checkout's MCP server as an agent does (`node bin/dreamcut.mjs mcp`, the command the README
// gives Claude Code and Codex): initialize, list the tools, then close stdin and expect the server to exit.
//   node mcp-check.mjs        from anywhere; it finds the checkout from its own path
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const results = [];
const check = (ok, name, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

const server = spawn(process.execPath, [path.join(repo, 'bin', 'dreamcut.mjs'), 'mcp'], { cwd: repo, stdio: ['pipe', 'pipe', 'inherit'] });
const replies = new Map();
readline.createInterface({ input: server.stdout }).on('line', line => {
  try { const message = JSON.parse(line); if (message.id != null) replies.get(message.id)?.(message); } catch {}
});
const request = (id, method, params = {}) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no reply to ${method} in 120 s`)), 120_000);
  replies.set(id, message => { clearTimeout(timer); resolve(message); });
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
});

try {
  const init = await request(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'windows-compatibility', version: '1' } });
  check(Boolean(init.result?.serverInfo), 'the MCP server answers initialize', init.result?.serverInfo?.name ?? JSON.stringify(init.error));
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const list = await request(2, 'tools/list');
  const tools = list.result?.tools?.map(tool => tool.name) ?? [];
  check(tools.includes('editor_open'), 'tools/list includes editor_open', `${tools.length} tools`);
} catch (error) {
  check(false, 'the MCP server answers', error.message);
}
server.stdin.end();
const exited = await new Promise(resolve => {
  const timer = setTimeout(() => resolve(false), 15_000);
  server.once('exit', () => { clearTimeout(timer); resolve(true); });
});
check(exited, 'the server exits when the agent disconnects');
if (!exited) server.kill();
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
