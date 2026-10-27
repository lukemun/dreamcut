import assert from 'node:assert/strict';
import test from 'node:test';
import { changelogSection, planRelease } from '../packaging/publish-release.mjs';

const repo = 'lukemun/dreamcut';
const at = (tag, file) => `https://github.com/${repo}/releases/download/${tag}/${file}`;
const archive = (file, url, bytes = 10) => ({ file, url, bytes, sha256: 'a'.repeat(64), folder: file.replace('.tar.gz', '') });
const feed = (version, app, base) => ({ version, platforms: { 'darwin-arm64': { app, base: { id: 'b1', ...base } } } });

test('a new release attaches its own archives and checks a base reused from an earlier release', () => {
  const plan = planRelease({
    repo, tag: 'v0.3.0',
    feed: feed('0.3.0', archive('app-0.3.0.tar.gz', at('v0.3.0', 'app-0.3.0.tar.gz')), archive('base-b1.tar.gz', at('v0.2.0', 'base-b1.tar.gz'))),
  });
  assert.deepEqual(plan.upload.map(entry => entry.file), ['app-0.3.0.tar.gz']);
  assert.deepEqual(plan.reused.map(entry => entry.file), ['base-b1.tar.gz']);
});

test('archives already attached with the same size are kept; a different size stops the publish', () => {
  const local = feed('0.2.0', archive('app-0.2.0.tar.gz', at('v0.2.0', 'app-0.2.0.tar.gz')), archive('base-b1.tar.gz', at('v0.2.0', 'base-b1.tar.gz')));
  const plan = planRelease({ repo, tag: 'v0.2.0', feed: local, attached: new Map([['app-0.2.0.tar.gz', 10]]) });
  assert.deepEqual(plan.keep.map(entry => entry.file), ['app-0.2.0.tar.gz']);
  assert.deepEqual(plan.upload.map(entry => entry.file), ['base-b1.tar.gz']);
  assert.throws(() => planRelease({ repo, tag: 'v0.2.0', feed: local, attached: new Map([['app-0.2.0.tar.gz', 11]]) }), /never change/);
});

test('platforms built elsewhere for the same version are merged, and an archive without an address is refused', () => {
  const linux = { 'linux-x64': { app: archive('app-linux.tar.gz', at('v0.2.0', 'app-linux.tar.gz')), base: { id: 'b2', ...archive('base-b2.tar.gz', at('v0.2.0', 'base-b2.tar.gz')) } } };
  const local = feed('0.2.0', archive('app-0.2.0.tar.gz', at('v0.2.0', 'app-0.2.0.tar.gz')), archive('base-b1.tar.gz', at('v0.2.0', 'base-b1.tar.gz')));
  const plan = planRelease({ repo, tag: 'v0.2.0', feed: local, published: { version: '0.2.0', platforms: linux } });
  assert.deepEqual(Object.keys(plan.feed.platforms).sort(), ['darwin-arm64', 'linux-x64']);
  assert.throws(() => planRelease({ repo, tag: 'v0.2.0', feed: feed('0.2.0', archive('app.tar.gz'), archive('base.tar.gz')) }), /no download address/);
});

test('release notes come from the version section of the changelog', () => {
  const text = '# Changelog\n\nIntro.\n\n## 0.2.0 — 2026-10-15\n\n- First public release.\n\n## 0.1.2\n\n- Older.\n';
  assert.equal(changelogSection(text, '0.2.0'), '- First public release.');
  assert.equal(changelogSection(text, '9.9.9'), 'DreamCut 9.9.9');
});
