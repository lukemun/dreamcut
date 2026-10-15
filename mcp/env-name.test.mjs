import test from 'node:test';
import assert from 'node:assert/strict';
import { envName, readEnv } from './env-name.mjs';
import { envName as tsEnvName, readEnv as tsReadEnv } from '../src/lib/env-name.ts';

for (const [label, read, name] of [['mjs', readEnv, envName], ['ts', tsReadEnv, tsEnvName]]) {
  test(`${label} readEnv prefers DREAMCUT_ and falls back to legacy OPENEDIT_`, () => {
    assert.equal(name('PROFILE_DIR'), 'DREAMCUT_PROFILE_DIR');
    assert.equal(read('PROFILE_DIR', { DREAMCUT_PROFILE_DIR: '/new', OPENEDIT_PROFILE_DIR: '/old' }), '/new');
    assert.equal(read('PROFILE_DIR', { OPENEDIT_PROFILE_DIR: '/old' }), '/old');
    assert.equal(read('PROFILE_DIR', { DREAMCUT_PROFILE_DIR: '', OPENEDIT_PROFILE_DIR: '/old' }), '', 'an explicit empty value still overrides');
    assert.equal(read('PROFILE_DIR', {}), undefined);
  });
}
