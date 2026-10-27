import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseDecision } from './release-gate.mjs';

test('a new version releases and publishes its launcher', () => {
  assert.deepEqual(releaseDecision({ version: '0.3.0', held: [], released: false, onNpm: false }), { release: true, npm: true, reason: '0.3.0 is new.' });
});

test('a held version never publishes, even when it is new', () => {
  const decision = releaseDecision({ version: '0.2.1', held: ['0.2.1'], released: false, onNpm: false });
  assert.equal(decision.release, false); assert.equal(decision.npm, false);
});

test('a released version is not released again; a missing launcher still publishes', () => {
  assert.deepEqual(releaseDecision({ version: '0.2.0', held: [], released: true, onNpm: true }), { release: false, npm: false, reason: '0.2.0 is already released.' });
  assert.equal(releaseDecision({ version: '0.2.0', held: [], released: true, onNpm: false }).npm, true);
});

test('a version already on npm releases without republishing the launcher', () => {
  assert.equal(releaseDecision({ version: '0.3.0', held: [], released: false, onNpm: true }).npm, false);
});

test('an invalid version stops the gate', () => {
  assert.throws(() => releaseDecision({ version: 'next', held: [], released: false, onNpm: false }), /Invalid version/);
});

test('another computer adds its download to an existing release, once', () => {
  assert.deepEqual(releaseDecision({ version: '0.3.0', held: [], released: true, onNpm: true, addPlatform: 'win32-x64', platformPublished: false }),
    { release: true, npm: false, reason: '0.3.0 gains a win32-x64 download.' });
  assert.equal(releaseDecision({ version: '0.3.0', held: [], released: true, onNpm: true, addPlatform: 'win32-x64', platformPublished: true }).release, false);
  assert.equal(releaseDecision({ version: '0.3.0', held: [], released: false, onNpm: false, addPlatform: 'win32-x64' }).release, false);
  assert.equal(releaseDecision({ version: '0.2.1', held: ['0.2.1'], released: true, onNpm: true, addPlatform: 'win32-x64' }).release, false);
});
