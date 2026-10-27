import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildMcp, mcpEntries } from './build-mcp.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the compiled MCP server replaces its readable entries and still finds the data beside it', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'build-mcp-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp(path.join(repository, 'mcp'), path.join(root, 'mcp'), { recursive: true });
  for (const name of ['node_modules', 'src', 'scripts', 'docs', '.agents', 'package.json', 'AGENTS.md']) await fs.symlink(path.join(repository, name), path.join(root, name));
  await buildMcp(root);
  for (const entry of mcpEntries) {
    const lines = async file => (await fs.readFile(file, 'utf8')).split('\n').length;
    // Minified: a handful of lines (multi-line template strings) against the readable source.
    assert.ok(await lines(path.join(root, entry)) * 5 < await lines(path.join(repository, entry)), `${entry} is compiled`);
  }
  assert.deepEqual((await fs.readdir(path.join(root, 'mcp'))).filter(name => name === 'chunks' || name === '.mcp-build'), []);

  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'build-mcp-profile-'));
  t.after(() => fs.rm(profile, { recursive: true, force: true }));
  const child = spawn(process.execPath, ['mcp/server.mjs', '--profile=full'], { cwd: root, env: { ...process.env, DREAMCUT_PROFILE_DIR: profile, TIMELINE_PROJECTS_DIR: path.join(profile, 'projects') } });
  t.after(() => child.kill());
  const reply = await new Promise((resolve, reject) => {
    let out = '', err = '';
    child.stdout.on('data', data => { out += data; const end = out.indexOf('\n'); if (end >= 0) resolve(JSON.parse(out.slice(0, end))); });
    child.stderr.on('data', data => { err += data; });
    child.on('exit', code => reject(new Error(`server exited ${code}: ${err.slice(-500)}`)));
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } })}\n`);
  });
  assert.equal(reply.result.serverInfo.name.length > 0, true);
  assert.match(reply.result.instructions, /capability_catalog/);
});
