import assert from 'node:assert/strict';
import test from 'node:test';
import { REQUIRED, SOURCES } from './build-ffmpeg.mjs';

test('every FFmpeg source is pinned and named with its licence', () => {
  for (const source of SOURCES) {
    assert.ok(source.git ? /^[0-9a-f]{40}$/.test(source.commit) : /^[0-9a-f]{64}$/.test(source.sha256) && source.url.startsWith('https://'), source.name);
    assert.ok(source.license && source.notices.length, `${source.name} names its licence files`);
  }
  assert.ok(REQUIRED.filters.includes('vidstabdetect') && REQUIRED.protocols.includes('http'), 'stabilization and the local media server are checked');
});
