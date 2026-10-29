import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { restampPreparationReceipts } from './run-editing-case.mjs';

test('a copied fixture keeps its prepared clips ready, but never for changed bytes', async () => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'eval-case-restamp-'));
  const receipts = path.join(project, 'preprocess', 'media-preparation');
  await fs.mkdir(receipts, { recursive: true }); await fs.mkdir(path.join(project, 'media', 'cutouts'), { recursive: true });
  const write = async (name, bytes, receipt) => {
    await fs.writeFile(path.join(project, 'media', 'cutouts', name), bytes);
    await fs.writeFile(path.join(receipts, `${name}.json`), JSON.stringify({ source: `cutouts/${name}`, mtime: 1, ctime: 1, ...receipt }));
  };
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  await write('same.webm', 'abc', { size: 3, source_hash: hash('abc') });
  await write('edited.webm', 'abd', { size: 3, source_hash: hash('abc') });
  await write('resized.webm', 'abcd', { size: 3 });
  assert.equal(await restampPreparationReceipts(project), 1);
  const read = async name => JSON.parse(await fs.readFile(path.join(receipts, `${name}.json`), 'utf8'));
  const stat = await fs.stat(path.join(project, 'media', 'cutouts', 'same.webm'));
  assert.deepEqual([(await read('same.webm')).mtime, (await read('same.webm')).ctime], [stat.mtimeMs, stat.ctimeMs]);
  assert.equal((await read('edited.webm')).mtime, 1);
  assert.equal((await read('resized.webm')).mtime, 1);
  await fs.rm(project, { recursive: true, force: true });
});
