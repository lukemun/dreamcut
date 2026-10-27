import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';

// An agent that extends the proposal contract regenerates proposal-schema.json; the running server must
// publish and accept the new field in the same session, without a restart.
test('a regenerated proposal schema is adopted without restarting the server', {timeout: 15000}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamcut-schema-reload-'));
  const schemaPath = path.join(dir, 'proposal-schema.json');
  const schema = JSON.parse(fs.readFileSync(new URL('./proposal-schema.json', import.meta.url), 'utf8'));
  fs.writeFileSync(schemaPath, JSON.stringify(schema));
  const child = spawn(process.execPath, ['mcp/server.mjs', '--profile=full'], {stdio: ['pipe', 'pipe', 'pipe'], env: {
    ...process.env, DREAMCUT_PROPOSAL_SCHEMA_PATH: schemaPath, DREAMCUT_TOOL_FAMILIES: '',
    // Nothing listens here, so an accepted call never reaches a real editor.
    TIMELINE_EDITOR_BASE_URL: 'http://127.0.0.1:9',
  }});
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
    fs.rmSync(dir, {recursive: true, force: true});
  });
  const pending = new Map(), notices = [];
  let id = 0;
  createInterface({input: child.stdout}).on('line', line => {
    const message = JSON.parse(line);
    if (message.id === undefined) notices.push(message.method);
    else pending.get(message.id)?.(message);
  });
  const request = (method, params) => new Promise(resolve => { const key = ++id; pending.set(key, resolve); child.stdin.write(JSON.stringify({jsonrpc: '2.0', id: key, method, params}) + '\n'); });
  const proposalProperties = async () => (await request('tools/list', {})).result.tools.find(tool => tool.name === 'proposal_create').inputSchema.properties.proposal.properties;
  const propose = () => request('tools/call', {name: 'proposal_create', arguments: {project_id: 'schema-reload-fixture', proposal: {zz_reload_probe: true}}});

  await request('initialize', {clientInfo: {name: 'automated-schema-reload-fixture', version: '1'}});
  assert.equal('zz_reload_probe' in await proposalProperties(), false);
  const before = await propose();
  assert.match(JSON.stringify(before), /INVALID_ARGUMENTS/);
  assert.match(JSON.stringify(before), /zz_reload_probe/);

  schema.properties.zz_reload_probe = {type: 'boolean', description: 'Field added by a contract extension.'};
  fs.writeFileSync(schemaPath, JSON.stringify(schema));
  const later = new Date(Date.now() + 2000);
  fs.utimesSync(schemaPath, later, later);

  assert.equal((await proposalProperties()).zz_reload_probe?.type, 'boolean');
  assert.deepEqual(notices.filter(method => method === 'notifications/tools/list_changed').length, 1);
  const after = await propose();
  assert.doesNotMatch(JSON.stringify(after), /zz_reload_probe/, 'the new field passes the server pre-check');

  // A half-written file keeps the last good schema.
  fs.writeFileSync(schemaPath, '{"type":');
  const latest = new Date(Date.now() + 4000);
  fs.utimesSync(schemaPath, latest, latest);
  assert.equal((await proposalProperties()).zz_reload_probe?.type, 'boolean');
});
