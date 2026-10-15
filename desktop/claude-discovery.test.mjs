import test from 'node:test';
import assert from 'node:assert/strict';
import { claudeCandidates, discoverClaude } from './claude-discovery.mjs';

test('Claude discovery respects explicit executable and excludes relative PATH entries', () => {
  assert.deepEqual(claudeCandidates({ DREAMCUT_CLAUDE_EXECUTABLE: '/chosen/claude' }, '/home'), ['/chosen/claude']);
  assert.deepEqual(claudeCandidates({ DREAMCUT_CLAUDE_EXECUTABLE: './untrusted' }, '/home'), []);
  const found = claudeCandidates({ PATH: '.:relative:/bin' }, '/home');
  assert.ok(found.every(candidate => candidate.startsWith('/')));
  assert.ok(found.includes('/home/.claude/local/claude'));
});

test('Claude discovery reports bounded sign-in state without account details', async () => {
  const calls = [];
  const result = await discoverClaude({ env: { DREAMCUT_CLAUDE_EXECUTABLE: '/chosen/claude' }, home: '/home',
    executable: async () => {}, run: async (_file, args) => {
      calls.push(args);
      return args[0] === '--version' ? { stdout: '2.1.212 (Claude Code)\n' }
        : { stdout: JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', email: 'PRIVATE@example.com' }) };
    } });
  assert.deepEqual(result, { state: 'available', source: 'installed', executable: '/chosen/claude', version: '2.1.212', authentication: 'signed-in' });
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.deepEqual(calls, [['--version'], ['auth', 'status']]);
});

test('signed-out status that exits non-zero stays distinct from an unknown CLI', async () => {
  const env = { DREAMCUT_CLAUDE_EXECUTABLE: '/chosen/claude' };
  const signedOut = await discoverClaude({ env, executable: async () => {}, run: async (_file, args) => {
    if (args[0] === '--version') return { stdout: '2.1.212 (Claude Code)' };
    throw Object.assign(new Error('exit 1'), { stdout: '{"loggedIn":false}' });
  } });
  assert.equal(signedOut.authentication, 'signed-out');
  const older = await discoverClaude({ env, executable: async () => {}, run: async (_file, args) => {
    if (args[0] === '--version') return { stdout: '1.0.0 (Claude Code)' };
    throw Object.assign(new Error('unknown command'), { stdout: '' });
  } });
  assert.equal(older.authentication, 'unknown');
});

test('without an installed CLI the bundled Agent SDK copy is used when present', async () => {
  const missing = { env: { DREAMCUT_CLAUDE_EXECUTABLE: '/missing/claude' }, executable: async () => { throw Error(); } };
  assert.deepEqual(await discoverClaude({ ...missing, bundled: () => true }), { state: 'available', source: 'bundled', authentication: 'unknown' });
  assert.deepEqual(await discoverClaude({ ...missing, bundled: () => false }), { state: 'not-found', authentication: 'unknown' });
});

test('a newer bundled Claude Code replaces a stale install unless the executable is chosen explicitly', async () => {
  const run = async (_file, args) => args[0] === '--version' ? { stdout: '2.1.212 (Claude Code)' } : { stdout: '{"loggedIn":true}' };
  const found = { home: '/home', executable: async file => { if (file !== '/home/.local/bin/claude') throw Error(); }, run };
  assert.deepEqual(await discoverClaude({ ...found, env: { PATH: '' }, bundled: () => '2.1.287' }),
    { state: 'available', source: 'bundled', version: '2.1.287', authentication: 'signed-in' });
  assert.equal((await discoverClaude({ ...found, env: { PATH: '' }, bundled: () => '2.1.100' })).source, 'installed');
  assert.equal((await discoverClaude({ ...found, env: { PATH: '' }, bundled: () => true })).source, 'installed');
  assert.equal((await discoverClaude({ ...found, env: { PATH: '', DREAMCUT_CLAUDE_EXECUTABLE: '/home/.local/bin/claude' }, bundled: () => '2.1.287' })).source, 'installed');
});
