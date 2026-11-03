import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { historicalScanInputs, stagedScanInput } from './private-file-scan-input.mjs';

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamcut-secret-test-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  return { cwd, git };
}

test('scan receives full staged binary bytes even when Git omits them from its diff', t => {
  const { cwd, git } = fixture(t);
  const bytes = Buffer.from('header\0synthetic-secret-regression-marker\0tail');
  fs.writeFileSync(path.join(cwd, 'fixture.bin'), bytes);
  git('add', 'fixture.bin');
  assert.match(git('diff', '--cached').toString(), /Binary files/);
  assert.ok(stagedScanInput(git).includes(bytes));
  // Cleaning the working copy cannot hide the index's content from the hook.
  fs.writeFileSync(path.join(cwd, 'fixture.bin'), 'clean working copy');
  assert.ok(stagedScanInput(git).includes(bytes));
});

test('staged scan reads complete text blobs, handles unusual filenames, and fails closed on size', t => {
  const { cwd, git } = fixture(t);
  const name = 'spaces and\nnewline.txt';
  fs.writeFileSync(path.join(cwd, name), 'complete staged content');
  git('add', '--', name);
  assert.equal(stagedScanInput(git).toString(), 'complete staged content\n\n');
  assert.throws(() => stagedScanInput(git, 5), /exceeds the secret-scan limit/);
});

test('empty index produces empty scan input', t => {
  assert.equal(stagedScanInput(fixture(t).git).length, 0);
});

test('history includes deleted binary blobs, deduplicates unchanged blobs and preserves full blobs across batches', t => {
  const { cwd, git } = fixture(t);
  const commit = () => git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Fixture');
  const bytes = Buffer.from('header\0historical-marker\0tail');
  fs.writeFileSync(path.join(cwd, 'fixture.bin'), bytes);
  git('add', 'fixture.bin');
  commit();
  fs.writeFileSync(path.join(cwd, 'other.txt'), 'another complete blob');
  git('add', 'other.txt');
  commit();
  git('rm', 'fixture.bin');
  commit();
  const checked = [];
  const batches = [...historicalScanInputs(git, ['HEAD'], files => checked.push(...files), 10)];
  assert.ok(batches.some(batch => batch.includes(bytes)));
  assert.equal(Buffer.concat(batches).toString().split('historical-marker').length, 2);
  assert.ok(checked.includes('fixture.bin'));
  assert.ok(batches.length > 1);
});

test('outgoing scan excludes already-published ancestors but still scans added-then-deleted outgoing blobs', t => {
  const {cwd,git}=fixture(t);
  const commit=()=>git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Fixture');
  fs.writeFileSync(path.join(cwd,'legacy.txt'),'published-ancestor'); git('add','.'); commit();
  const base=git('rev-parse','HEAD').toString().trim();
  git('rm','legacy.txt'); fs.writeFileSync(path.join(cwd,'transient.txt'),'outgoing-transient'); git('add','.'); commit();
  git('rm','transient.txt'); commit();
  const checked=[];
  const content=Buffer.concat([...historicalScanInputs(git,['HEAD',`^${base}`],files=>checked.push(...files))]).toString();
  assert.ok(!checked.includes('legacy.txt')); assert.ok(checked.includes('transient.txt'));
  assert.match(content,/outgoing-transient/); assert.doesNotMatch(content,/published-ancestor/);
});
