import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { resetConversation, assertConversationReady } from './conversation-reset.mjs';
import { acquireProjectLease } from './project-lease.mjs';
async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-conversation-reset-'));
  try {
    const project = path.join(root, 'project'), userData = path.join(root, 'app');
    await fs.mkdir(project); await fs.writeFile(path.join(project, 'timeline.json'), 'original timeline');
    const canonical = await fs.realpath(project), key = createHash('sha256').update(canonical).digest('hex');
    const journal = path.join(userData, 'codex-editing-journals', key), ownership = path.join(userData, 'codex-sessions', `${key}.json`);
    await fs.mkdir(journal, { recursive: true }); await fs.mkdir(path.dirname(ownership), { recursive: true });
    const bytes = JSON.stringify({ pinned: { instructionsVersion: 1 }, operations: [{ status: 'completed' }] });
    await fs.writeFile(path.join(journal, 'checkpoint.json'), bytes); await fs.writeFile(ownership, 'original ownership');
    await run({ project: canonical, userData, journal, ownership, key, bytes });
    assert.equal(await fs.readFile(path.join(project, 'timeline.json'), 'utf8'), 'original timeline');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
test('new conversation preserves exact prior audit and ownership bytes outside the project', async () => fixture(async data => {
  await resetConversation({ userData: data.userData, projectDirectory: data.project });
  const parent = path.join(data.userData, 'codex-conversation-archives', data.key);
  const names = await fs.readdir(parent); assert.equal(names.length, 1);
  assert.equal(await fs.readFile(path.join(parent, names[0], 'journal/checkpoint.json'), 'utf8'), data.bytes);
  assert.equal(await fs.readFile(path.join(parent, names[0], 'ownership.json'), 'utf8'), 'original ownership');
  await assert.rejects(fs.access(data.journal), { code: 'ENOENT' });
  await assertConversationReady(data.userData, data.project);
}));
test('active host lease, live writer and unknown tool outcomes cannot be bypassed', async () => fixture(async data => {
  const options = { userData: data.userData, projectDirectory: data.project };
  const lease = acquireProjectLease(data.project);
  await assert.rejects(resetConversation(options), /open Codex session/); lease.release();
  await fs.writeFile(path.join(data.journal, 'session.lease'), JSON.stringify({ pid: process.pid }));
  await assert.rejects(resetConversation(options), /still in use/);
  await fs.unlink(path.join(data.journal, 'session.lease'));
  await fs.writeFile(path.join(data.journal, 'checkpoint.json'), JSON.stringify({ operations: [{ status: 'unknown' }] }));
  await assert.rejects(resetConversation(options), /was interrupted/);
  assert.equal(await fs.readFile(data.ownership, 'utf8'), 'original ownership');
}));
test('a call settled as unconfirmed no longer blocks starting a new conversation', async () => fixture(async data => {
  await fs.writeFile(path.join(data.journal, 'checkpoint.json'), JSON.stringify({ operations: [{ status: 'unconfirmed' }] }));
  await resetConversation({ userData: data.userData, projectDirectory: data.project });
}));
test('interrupted archive blocks reconnect and can finish without overwriting retained records', async () => fixture(async data => {
  const archiveId = randomUUID(), archive = path.join(data.userData, 'codex-conversation-archives', data.key, archiveId);
  const marker = path.join(data.userData, 'codex-conversation-resets', `${data.key}.json`);
  await fs.mkdir(archive, { recursive: true }); await fs.mkdir(path.dirname(marker), { recursive: true });
  await fs.writeFile(marker, JSON.stringify({ version: 1, project: data.project, archiveId }));
  await fs.rename(data.journal, path.join(archive, 'journal'));
  await assert.rejects(assertConversationReady(data.userData, data.project), /interrupted/);
  await resetConversation({ userData: data.userData, projectDirectory: data.project });
  await assertConversationReady(data.userData, data.project);
  assert.equal(await fs.readFile(path.join(archive, 'journal/checkpoint.json'), 'utf8'), data.bytes);
  assert.equal(await fs.readFile(path.join(archive, 'ownership.json'), 'utf8'), 'original ownership');
}));
