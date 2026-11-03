import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { codexSessionStore } from './codex-session-store.mjs';

test('session ownership persists privately per canonical project and rejects misplaced records', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-ownership-'));
  try {
    const project = path.join(root, 'project'), other = path.join(root, 'other');
    await fs.mkdir(project); await fs.mkdir(other);
    const data = path.join(root, 'app');
    const store = await codexSessionStore(data, project);
    assert.equal(await store.read(), null);
    await store.save('thread-123');
    const reloaded = await codexSessionStore(data, project);
    assert.equal((await reloaded.read()).threadId, 'thread-123');
    const alias = path.join(root, 'alias'); await fs.symlink(project, alias);
    assert.equal((await (await codexSessionStore(data, alias)).read()).threadId, 'thread-123');
    assert.equal(await (await codexSessionStore(data, other)).read(), null);
    const directory = path.join(data, 'codex-sessions');
    const files = await fs.readdir(directory); assert.equal(files.length, 1);
    const file = path.join(directory, files[0]);
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    await assert.rejects(store.save('../foreign'), /ownership/);
    await fs.writeFile(file, JSON.stringify({ version: 1, project: other, threadId: 'foreign' }));
    await assert.rejects(store.read(), /ownership/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
