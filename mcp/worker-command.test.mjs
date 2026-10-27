import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { workerCommand } from './worker-command.mjs';
import { workerCommand as editorWorkerCommand, workerImplementationFiles } from '../src/lib/worker-command.ts';
import { compiledWorkerName } from '../desktop/build-workers.mjs';
import { workerEntries } from '../desktop/worker-dependencies.mjs';

test('a job runs compiled when workers/<name>.mjs exists, and from source through tsx otherwise', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-command-'));
  for (const run of [workerCommand, editorWorkerCommand]) {
    assert.deepEqual(run('scripts/qc.ts', ['p1'], root), { command: process.execPath, args: ['--import', 'tsx', path.join(root, 'scripts/qc.ts'), 'p1'] });
  }
  fs.mkdirSync(path.join(root, 'workers'));
  fs.writeFileSync(path.join(root, 'workers', 'qc.mjs'), '');
  fs.writeFileSync(path.join(root, 'workers', 'visual-analysis-cli.mjs'), '');
  for (const run of [workerCommand, editorWorkerCommand]) {
    assert.deepEqual(run('scripts/qc.ts', ['p1'], root), { command: process.execPath, args: [path.join(root, 'workers', 'qc.mjs'), 'p1'] });
    assert.deepEqual(run('mcp/visual-analysis-cli.ts', ['work'], root).args, [path.join(root, 'workers', 'visual-analysis-cli.mjs'), 'work']);
  }
});

test('a job is fingerprinted by the compiled worker a runtime ships, else by its sources', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-files-'));
  assert.deepEqual(workerImplementationFiles('scripts/align.ts', ['src/lib/instruments/alignment-chunks.ts'], root),
    [path.join(root, 'scripts/align.ts'), path.join(root, 'src/lib/instruments/alignment-chunks.ts')]);
  // A packaged runtime ships no TypeScript source; the bundled worker carries the chunk module.
  fs.mkdirSync(path.join(root, 'workers'));
  fs.writeFileSync(path.join(root, 'workers', 'align.mjs'), '');
  assert.deepEqual(workerImplementationFiles('scripts/align.ts', ['src/lib/instruments/alignment-chunks.ts'], root), [path.join(root, 'workers', 'align.mjs')]);
});

test('every background job compiles to its own file name', () => {
  const names = workerEntries.map(compiledWorkerName);
  assert.equal(new Set(names).size, names.length);
  assert.equal(compiledWorkerName('scripts/still-worker.ts'), 'still-worker.mjs');
  for (const entry of workerEntries) assert.ok(fs.existsSync(path.resolve(import.meta.dirname, '..', entry)), entry);
});
