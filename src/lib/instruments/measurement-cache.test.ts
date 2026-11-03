import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMeasurementCache } from './measurement-cache';

test('measurement reuse survives runs, distinguishes empty ink, and invalidates pixels/settings/code', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'measurement-cache-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const picture = path.join(root, 'picture'); fs.writeFileSync(picture, 'pixels');
  const directory = path.join(root, 'cache');
  let calls = 0;
  const compute = () => { calls++; return null; };
  const run = (version = 'v1', threshold = 8) => createMeasurementCache(directory, version).measure('ink', [picture], { threshold }, compute);
  assert.equal(run(), null); assert.equal(run(), null); assert.equal(calls, 1);
  fs.writeFileSync(picture, 'PIXELS'); run(); assert.equal(calls, 2);
  run('v2'); run('v2', 9); assert.equal(calls, 4);
  for (const file of fs.readdirSync(directory)) fs.writeFileSync(path.join(directory, file), '{');
  run(); assert.equal(calls, 5);
  const fresh = createMeasurementCache(directory, null);
  fresh.measure('ink', [picture], {}, compute); fresh.measure('ink', [picture], {}, compute);
  assert.equal(fresh.stats.bypasses, 2); assert.equal(calls, 7);
});

test('failed or racing measurements never become reusable evidence', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'measurement-race-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const picture = path.join(root, 'picture'); fs.writeFileSync(picture, 'before');
  const cache = createMeasurementCache(path.join(root, 'cache'), 'v1');
  assert.throws(() => cache.measure('ink', [picture], {}, () => { throw Error('decode failed'); }), /decode failed/);
  assert.throws(() => cache.measure('ink', [picture], {}, () => { fs.writeFileSync(picture, 'after'); return null; }), /changed during/);
  assert.equal(cache.stats.hits, 0);
  assert.equal(fs.existsSync(path.join(root, 'cache')), false);
});
