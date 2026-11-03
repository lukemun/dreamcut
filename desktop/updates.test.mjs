import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createUpdateController, updateFeed } from './updates.mjs';
const runtime = { packaged: true, platform: 'darwin', arch: 'arm64', version: '0.1.0' };
const manifest = { schemaVersion: 1, platform: 'darwin', arch: 'arm64', version: '0.1.0', channel: 'preview', feedUrl: 'https://updates.example/preview/arm64.json' };
function fixture(options = {}) {
  const events = [], updater = new EventEmitter();
  updater.setFeedURL = value => events.push(['feed', value]);
  updater.checkForUpdates = () => events.push('check');
  updater.quitAndInstall = () => events.push('install');
  const controller = createUpdateController({ updater, feed: manifest.feedUrl,
    verifySignature: async () => events.push('signature'), prepareToInstall: async () => events.push('drain'), ...options });
  return { events, updater, controller };
}
test('only matching packaged release metadata can enable HTTPS updates', () => {
  assert.equal(updateFeed(manifest, runtime), manifest.feedUrl);
  assert.equal(updateFeed({ channel: 'local' }, runtime), null);
  assert.equal(updateFeed(manifest, { ...runtime, packaged: false }), null);
  for (const changed of [{ version: '1.0.0' }, { arch: 'x64' }, { channel: 'unknown' }, { feedUrl: 'http://updates.example' }, { feedUrl: 'https://secret@updates.example' }]) {
    assert.throws(() => updateFeed({ ...manifest, ...changed }, runtime));
  }
});
test('concurrent checks do not duplicate downloads; failure permits explicit retry', async () => {
  const { events, updater, controller } = fixture();
  await Promise.all([controller.check(), controller.check()]);
  assert.equal(events.filter(x => x === 'check').length, 1);
  updater.emit('error', Error('private host details'));
  assert.equal(controller.state, 'failed');
  await controller.check();
  assert.equal(events.filter(x => x === 'check').length, 2);
  updater.emit('update-not-available'); assert.equal(controller.state, 'current');
  controller.dispose(); assert.equal(updater.listenerCount('error'), 0);
});
test('signature failure makes no feed or download request', async () => {
  const { events, controller } = fixture({ verifySignature: async () => { throw Error('invalid'); } });
  await controller.check(); assert.equal(controller.state, 'failed'); assert.deepEqual(events, []);
});
test('installation waits for owned jobs to drain, rejects duplicates and requires download', async () => {
  let release;
  const { events, updater, controller } = fixture({ prepareToInstall: () => new Promise(resolve => { release = resolve; }) });
  assert.equal(await controller.install(), false);
  await controller.check(); updater.emit('update-available'); updater.emit('update-downloaded');
  const installing = controller.install();
  assert.equal(await controller.install(), false); assert.equal(events.includes('install'), false);
  release(); assert.equal(await installing, true); assert.equal(events.at(-1), 'install');
});
test('shutdown failure prevents installation; local packages never check', async () => {
  const { events, updater, controller } = fixture({ prepareToInstall: async () => { throw Error('busy'); } });
  await controller.check(); updater.emit('update-downloaded');
  assert.equal(await controller.install(), false); assert.equal(events.includes('install'), false);
  const local = fixture({ feed: null }); await local.controller.check(); assert.deepEqual(local.events, []);
});
