import test from 'node:test';
import assert from 'node:assert/strict';
import { codexCandidates, discoverCodex } from './codex-discovery.mjs';
test('discovery respects explicit executable and excludes current-directory PATH entries', () => {
  assert.deepEqual(codexCandidates({ DREAMCUT_CODEX_EXECUTABLE: '/chosen/codex' }, '/home'), ['/chosen/codex']);
  assert.deepEqual(codexCandidates({ DREAMCUT_CODEX_EXECUTABLE: './untrusted' }, '/home'), []);
  assert.ok(codexCandidates({ PATH: '.:relative:/bin' }, '/home').every(p => pathIsAbsolute(p)));
});
function pathIsAbsolute(p) { return p.startsWith('/'); }
test('discovery returns bounded status without account or credential output', async () => {
  const calls = [];
  const result = await discoverCodex({ env: { DREAMCUT_CODEX_EXECUTABLE: '/chosen/codex' }, home: '/home',
    executable: async () => {}, run: async (_file, args, options) => {
      calls.push(args); assert.equal(options.timeout, 4000);
      return args[0] === '--version' ? { stdout: 'codex-cli 0.162.0\n' } : { stderr: 'Logged in using ChatGPT PRIVATE-ACCOUNT' };
    } });
  assert.equal(result.authentication, 'signed-in');
  assert.equal(result.version, '0.162.0');
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.deepEqual(calls, [['--version'], ['login', 'status']]);
});
test('missing executable and login failure remain distinct', async () => {
  const env = { DREAMCUT_CODEX_EXECUTABLE: '/chosen/codex' };
  assert.equal((await discoverCodex({ env, executable: async () => { throw Error(); } })).state, 'not-found');
  const result = await discoverCodex({ env, executable: async () => {}, run: async (_file, args) => {
    if (args[0] === '--version') return { stdout: 'codex-cli 0.162.0' };
    throw Object.assign(new Error(), { stderr: 'Not logged in' });
  } });
  assert.equal(result.authentication, 'signed-out');
});
