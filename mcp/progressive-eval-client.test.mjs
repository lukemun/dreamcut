import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { gradeRefreshProbe } from './client-refresh-probe.mjs';
const exec = promisify(execFile);
const cli = fileURLToPath(new URL('./progressive-eval-client.mjs', import.meta.url));
test('owned client registers refreshed schemas and enforces initial exposure and bounded scope', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'progressive-client-'));
  const run = async (...args) => JSON.parse((await exec(process.execPath, [cli, args[0], dir, ...args.slice(1)])).stdout);
  try {
    const initial = await run('start');
    assert.equal(initial.client.name, 'dreamcut-owned-eval-client');
    assert.equal(initial.tools.some(t => t.name === 'cutout_status'), false);
    assert.equal(initial.tools.some(t => t.name === 'capability_catalog' && t.inputSchema), true);
    const connection = path.join(dir, 'connection.json');
    assert.equal(fs.statSync(connection).mode & 0o777, 0o600);
    await assert.rejects(run('call', 'cutout_status', JSON.stringify({ project_id: 'refresh-probe', job_id: 'probe-job' })), /Command failed/);
    await assert.rejects(run('call', 'proposal_create', '{}'), /Command failed/);
    const loaded = await run('call', 'capability_catalog', JSON.stringify({ action: 'load', id: 'cutout-preparation' }));
    assert.ok(loaded.registered_count > initial.count);
    assert.ok(loaded.tools.some(t => t.name === 'cutout_status' && t.inputSchema));
    const status = await run('call', 'cutout_status', JSON.stringify({ project_id: 'refresh-probe', job_id: 'probe-job' }));
    assert.equal(status.result.isError, undefined);
    assert.match(JSON.stringify(status.result), /probe_nonce/);
    const probe = JSON.parse(fs.readFileSync(path.join(dir, 'probe-receipt.json'), 'utf8'));
    assert.equal(gradeRefreshProbe(probe).pass, true);
    const receipt = JSON.parse(fs.readFileSync(path.join(dir, 'client-receipt.json'), 'utf8'));
    assert.equal(receipt.events.filter(e => e.kind === 'rejected').length, 2);
    assert.equal(receipt.events.filter(e => e.kind === 'dispatch').length, 2);
  } finally {
    if (fs.existsSync(path.join(dir, 'connection.json'))) await run('stop');
    await new Promise(resolve => setTimeout(resolve, 100));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
