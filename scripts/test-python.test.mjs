import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testPythonEnv } from './test-python.mjs';

test('explicit interpreter wins over a wrong system Python and is inherited by tests', () => {
  const seen = [];
  const result = testPythonEnv({ DREAMCUT_PYTHON: '/configured/python', PATH: '/wrong/bin' }, command => { seen.push(command); return command === '/configured/python'; });
  assert.equal(result.DREAMCUT_PYTHON, '/configured/python');
  assert.equal(result.PATH, '/wrong/bin');
  assert.deepEqual(seen, ['/configured/python']);
});
test('broken explicit configuration fails actionably instead of silently falling back', () => {
  const seen = [];
  assert.throws(() => testPythonEnv({ DREAMCUT_PYTHON: '/broken/python' }, command => { seen.push(command); return false; }), /\.env\.test\.local/);
  assert.deepEqual(seen, ['/broken/python']);
});
test('portable fallback probes NumPy rather than accepting an executable name', () => {
  const seen = [];
  const result = testPythonEnv({ DREAMCUT_TOOLS_DIR: '/nonexistent-test-tools' }, command => { seen.push(command); return command === 'python'; });
  assert.equal(result.DREAMCUT_PYTHON, 'python');
  assert.deepEqual(seen, ['python3', 'python']);
});
test('missing NumPy refuses the run without skipping required coverage', () => {
  assert.throws(() => testPythonEnv({ DREAMCUT_TOOLS_DIR: '/nonexistent-test-tools' }, () => false), /no tests were skipped/);
});

test('normal runner passes the selected interpreter to its test child', () => {
  const env = testPythonEnv();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-python-runner-'));
  try {
    const file = path.join(dir, 'environment.test.mjs');
    fs.writeFileSync(file, `import assert from 'node:assert/strict'; assert.equal(process.env.DREAMCUT_PYTHON, ${JSON.stringify(env.DREAMCUT_PYTHON)});`);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./run-tests.mjs', import.meta.url)), file], { env, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stderr + result.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('normal runner refuses a broken explicit interpreter before dispatching tests', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./run-tests.mjs', import.meta.url)), '/must-not-run.test.mjs'], {
    env: { ...process.env, DREAMCUT_PYTHON: path.join(os.tmpdir(), 'missing-dreamcut-test-python') }, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Set DREAMCUT_PYTHON/);
  assert.doesNotMatch(result.stderr, /Could not find.*must-not-run/);
});
