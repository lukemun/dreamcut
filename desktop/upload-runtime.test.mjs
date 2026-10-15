import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mergeFeeds, publishRuntime } from '../packaging/upload-runtime.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const streamText = async body => {
  if (typeof body === 'string') return body;
  const chunks = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
};

function fixture(version = '0.2.0', contents = { base: 'base bytes', app: `app ${'bytes'}` }) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamcut upload '));
  const entry = layer => {
    const file = `dreamcut-${layer}-darwin-arm64-${layer === 'base' ? 'b1' : version}.tar.gz`;
    fs.writeFileSync(path.join(dist, file), contents[layer]);
    return { file, sha256: sha(contents[layer]), bytes: Buffer.byteLength(contents[layer]), folder: file.replace('.tar.gz', '') };
  };
  const feed = { version, platforms: { 'darwin-arm64': { base: { id: 'b1', ...entry('base') }, app: entry('app') } } };
  fs.writeFileSync(path.join(dist, 'latest.json'), JSON.stringify(feed));
  return { dist, feed };
}

function memoryStore(initial = {}) {
  const blobs = new Map(Object.entries(initial));
  const writes = [];
  return {
    blobs, writes,
    async head(pathname) { return blobs.has(pathname) ? { size: Buffer.byteLength(blobs.get(pathname)), url: `https://store.test/${pathname}` } : null; },
    async put(pathname, body, options) {
      if (blobs.has(pathname) && !options.allowOverwrite) throw new Error(`${pathname} exists`);
      blobs.set(pathname, await streamText(body));
      writes.push(pathname);
      return { url: `https://store.test/${pathname}` };
    },
    async read(pathname) { return blobs.get(pathname) ?? null; },
  };
}
const quiet = () => {};

test('archives and their checksums go up before the feed, and the location is reported', async t => {
  const { dist } = fixture();
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  const store = memoryStore();
  const { baseUrl, feed } = await publishRuntime({ dist, prefix: 'dreamcut/runtime', store, log: quiet });
  assert.equal(store.writes.at(-1), 'dreamcut/runtime/latest.json', 'the feed is written last');
  assert.equal(store.writes.length, 5, 'two archives, two checksums, one feed');
  assert.equal(baseUrl, 'https://store.test/dreamcut/runtime');
  assert.equal(JSON.parse(store.blobs.get('dreamcut/runtime/latest.json')).version, feed.version);
});

test('a second run skips published archives and only rewrites the feed', async t => {
  const { dist } = fixture();
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  const store = memoryStore();
  await publishRuntime({ dist, prefix: 'p', store, log: quiet });
  store.writes.length = 0;
  const { baseUrl } = await publishRuntime({ dist, prefix: 'p', store, log: quiet });
  assert.deepEqual(store.writes, ['p/latest.json']);
  assert.equal(baseUrl, 'https://store.test/p');
});

test('a published archive is never replaced with different contents', async t => {
  const first = fixture('0.2.0', { base: 'base v1', app: 'app v1' });
  const second = fixture('0.2.0', { base: 'base v1', app: 'app CHANGED' });
  t.after(() => { for (const { dist } of [first, second]) fs.rmSync(dist, { recursive: true, force: true }); });
  const store = memoryStore();
  await publishRuntime({ dist: first.dist, prefix: 'p', store, log: quiet });
  const feedBefore = store.blobs.get('p/latest.json');
  await assert.rejects(publishRuntime({ dist: second.dist, prefix: 'p', store, log: quiet }), /already published with different contents/);
  assert.equal(store.blobs.get('p/latest.json'), feedBefore, 'the feed is untouched');
  assert.equal(store.blobs.get('p/dreamcut-app-darwin-arm64-0.2.0.tar.gz'), 'app v1');
});

test('local files that do not match the feed stop everything before any upload', async t => {
  const { dist, feed } = fixture();
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dist, feed.platforms['darwin-arm64'].app.file), 'tampered!');
  const store = memoryStore();
  await assert.rejects(publishRuntime({ dist, prefix: 'p', store, log: quiet }), /does not match latest\.json/);
  assert.equal(store.writes.length, 0);
});

test('a dry run uploads nothing', async t => {
  const { dist } = fixture();
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  const store = memoryStore();
  const lines = [];
  await publishRuntime({ dist, prefix: 'p', store, dryRun: true, log: line => lines.push(line) });
  assert.equal(store.writes.length, 0);
  assert.ok(lines.some(line => /would upload/.test(line)));
});

test('feeds merge platforms built elsewhere and never go backwards', () => {
  const local = { version: '0.2.0', platforms: { 'darwin-arm64': { app: 'mac' } } };
  assert.deepEqual(mergeFeeds(local, { version: '0.2.0', platforms: { 'win32-x64': { app: 'win' }, 'darwin-arm64': { app: 'old mac' } } }).platforms,
    { 'win32-x64': { app: 'win' }, 'darwin-arm64': { app: 'mac' } });
  assert.deepEqual(mergeFeeds(local, { version: '0.1.0', platforms: { 'win32-x64': { app: 'win' } } }), local, 'an older feed is replaced');
  assert.throws(() => mergeFeeds(local, { version: '0.3.0', platforms: {} }), /newer than this build/);
  assert.deepEqual(mergeFeeds(local, null), local);
});
