import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resumeRetroPass } from './retro-pass-cache';

test('interrupted three-pass review resumes with two calls instead of repeating all three', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'retro-resume-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let calls = 0, fail = true;
  const validate = (value: unknown) => { assert.equal(typeof value, 'string'); return value as string; };
  const review = async () => {
    const results = [];
    for (const phase of ['batch1', 'batch2', 'synthesis']) results.push(await resumeRetroPass(directory, { phase, prompt: 'exact' }, validate, async () => {
      calls++; if (phase === 'batch2' && fail) throw Error('interrupted'); return phase;
    }));
    return results;
  };
  await assert.rejects(review(), /interrupted/);
  assert.equal(calls, 2);
  fail = false; calls = 0;
  assert.deepEqual(await review(), ['batch1','batch2','synthesis']);
  assert.equal(calls, 2);
  calls = 0; await review(); assert.equal(calls, 0);
});

test('changed evidence, schema, worker or corrupt output cannot reuse an old pass', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'retro-invalidation-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let calls = 0;
  const run = async () => { calls++; return { ok: true }; };
  const validate = (value: any) => { assert.equal(value.ok, true); return value; };
  const original = { prompt: 'one', schema: 1, worker: 'one', revision: 'one' };
  await resumeRetroPass(directory, original, validate, run);
  for (const field of Object.keys(original)) await resumeRetroPass(directory, { ...original, [field]: 'changed' }, validate, run);
  assert.equal(calls, 5);
  for (const file of fs.readdirSync(directory)) fs.writeFileSync(path.join(directory, file), '{');
  await resumeRetroPass(directory, original, validate, run); assert.equal(calls, 6);
  await assert.rejects(resumeRetroPass(directory, { invalid: true }, validate, async () => ({ ok: false })));
});
