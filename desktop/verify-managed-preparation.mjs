import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createWorkerOwner, WORKER_OWNER } from './owned-workers.mjs';

// Disposable engineering fixture; run with node --import tsx.
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-managed-preparation-'));
process.env.TIMELINE_PROJECTS_DIR = path.join(scratch, 'projects');
process.env.DREAMCUT_PROFILE_DIR = path.join(scratch, 'profile');
process.env.SENTRY_ENABLED = '0';
process.env.MEDIA_PREPARATION_AUTOSTART = '1';
const projectId = 'owned-worker-fixture';
const media = path.join(process.env.TIMELINE_PROJECTS_DIR, projectId, 'media');
await fs.mkdir(media, { recursive: true });
const source = path.join(media, 'fixture.mp4');
const hash = async () => createHash('sha256').update(await fs.readFile(source)).digest('hex');
let owner = createWorkerOwner();
process[WORKER_OWNER] = owner;
const waitUntil = async (predicate, label) => {
  const deadline = Date.now() + 20000;
  while (!await predicate()) {
    if (Date.now() > deadline) throw Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};
try {
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=2',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', source], { timeout: 15000 });
  const before = await hash();
  const { enqueueMediaPreparation, readPreparation, preparationDir } = await import('../src/lib/local-store/media-preparation.ts');
  enqueueMediaPreparation(projectId, 'fixture.mp4');
  assert.equal(owner.size, 1, 'production launcher must register with desktop owner');
  await waitUntil(async () => {
    try { await fs.access(path.join(preparationDir(projectId), 'worker.lock')); return true; } catch { return false; }
  }, 'worker ownership');
  assert.equal(readPreparation(projectId, 'fixture.mp4').state, 'preparing');
  await owner.stop();
  assert.equal(owner.size, 0);
  assert.equal(await hash(), before);
  // Reopening creates a fresh owner; the existing queue handles its stale lock.
  owner = createWorkerOwner();
  process[WORKER_OWNER] = owner;
  enqueueMediaPreparation(projectId, 'fixture.mp4', true);
  await waitUntil(() => owner.size === 0, 'retried preparation');
  const result = readPreparation(projectId, 'fixture.mp4');
  assert.equal(result.state, 'ready', result.error);
  assert.equal(await hash(), before);
  await assert.rejects(fs.access(path.join(preparationDir(projectId), 'worker.lock')));
  console.log('Production preparation launcher registered ownership; interrupted work stopped, retried to ready and preserved original bytes.');
} finally {
  await owner.stop();
  delete process[WORKER_OWNER];
  await fs.rm(scratch, { recursive: true, force: true });
}
