import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeCodeIdentity } from './code-identity.mjs';

test('the code identity covers built code, ignores where it is installed and changes with any file', async () => {
  const make = async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'code-identity-'));
    for (const [file, text] of [['src/a.ts', 'a'], ['workers/job.mjs', 'job'], ['.next-desktop/BUILD_ID', 'b1'], ['package.json', '{}'], ['src/node_modules/x.js', 'ignored'], ['public/p.png', 'not code']]) {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await fs.writeFile(path.join(root, file), text);
    }
    return root;
  };
  const one = await make(), two = await make();
  const identity = await writeCodeIdentity(one);
  assert.equal(await writeCodeIdentity(two), identity);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(one, 'code-identity.json'), 'utf8')), { schema: 1, identity });
  await fs.writeFile(path.join(two, 'public/p.png'), 'other');
  await fs.writeFile(path.join(two, 'src/node_modules/x.js'), 'other');
  assert.equal(await writeCodeIdentity(two), identity);
  await fs.writeFile(path.join(two, '.next-desktop/BUILD_ID'), 'b2');
  assert.notEqual(await writeCodeIdentity(two), identity);
});
