import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { workerPackageImports } from './worker-dependencies.mjs';

test('traces transitive TypeScript worker packages without executing source', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-worker-trace-'));
  try {
    await fs.mkdir(path.join(root, 'node_modules/fixture-package'), { recursive: true });
    await fs.writeFile(path.join(root, 'package.json'), '{}');
    await fs.writeFile(path.join(root, 'node_modules/fixture-package/package.json'), '{"main":"index.js"}');
    await fs.writeFile(path.join(root, 'node_modules/fixture-package/index.js'), 'throw Error("must not execute");');
    await fs.writeFile(path.join(root, 'worker.ts'), 'import { value } from "./helper"; const result: string = value; console.log(result);');
    await fs.writeFile(path.join(root, 'helper.ts'), 'import fs from "node:fs"; import value from "fixture-package"; export { value };');
    assert.deepEqual(await workerPackageImports(root, ['worker.ts']), ['fixture-package']);
    assert.equal(await fs.stat(path.join(root, 'trace-workers')).catch(() => null), null);
    await fs.writeFile(path.join(root, 'helper.ts'), 'import value from "missing-required-worker-package"; export { value };');
    await assert.rejects(workerPackageImports(root, ['worker.ts']), /Cannot find module/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
