import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopRuntimeEnvironment } from './runtime-environment.mjs';
test('Finder launches can resolve installed media tools while explicit absolute paths keep priority', () => {
  const env = desktopRuntimeEnvironment({ PATH: '/custom/bin:.:/usr/bin:/custom/bin', HOME: '/user' });
  assert.equal(env.PATH.split(':')[0], '/custom/bin');
  assert.ok(env.PATH.includes('/opt/homebrew/bin'));
  assert.equal(env.PATH.split(':').filter(p => p === '/custom/bin').length, 1);
  assert.ok(!env.PATH.split(':').includes('.'));
  assert.equal(env.HOME, '/user');
});
test('packaged media tools precede system installations', () => {
  const env = desktopRuntimeEnvironment({ PATH: '/opt/homebrew/bin:/usr/bin' }, { mediaToolsDirectory: '/App/Contents/Resources/media-tools/bin' });
  assert.equal(env.PATH.split(':')[0], '/App/Contents/Resources/media-tools/bin');
});
test('Finder fallback finds the user standalone Codex installation before Homebrew', () => {
  const env = desktopRuntimeEnvironment({ HOME: '/user', PATH: '/usr/bin:/bin' });
  assert.ok(env.PATH.indexOf('/user/.local/bin') < env.PATH.indexOf('/opt/homebrew/bin'));
});
