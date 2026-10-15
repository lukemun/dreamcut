import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseConfiguration } from './release-policy.mjs';
const base = { platform:'darwin', version: '0.1.0', arch: 'arm64' };
test('local packages have no update destination or embedded signing credentials', () => {
  const result = releaseConfiguration({ ...base, env: { DREAMCUT_SIGN_IDENTITY: 'private identity', DREAMCUT_NOTARY_PROFILE: 'private profile' } });
  assert.equal(result.manifest.channel, 'local');
  assert.equal(result.manifest.feedUrl, null);
  assert.equal(result.identity, undefined);
  assert.equal(result.keychainProfile, undefined);
});
test('release configuration fails closed for unsigned channels and unsafe feeds', () => {
  assert.throws(() => releaseConfiguration({ ...base, env: { DREAMCUT_RELEASE_CHANNEL: 'stable' } }), /signed/);
  for (const feed of ['http://updates.example/feed', 'https://user:secret@updates.example/feed', 'https://updates.example/feed?token=secret', 'https://updates.example/feed#x']) {
    assert.throws(() => releaseConfiguration({ ...base, argv: ['--sign'], env: { DREAMCUT_SIGN_IDENTITY: 'Developer ID Application: Example', DREAMCUT_RELEASE_CHANNEL: 'preview', DREAMCUT_UPDATE_FEED: feed } }), /HTTPS/);
  }
  assert.throws(() => releaseConfiguration({ ...base, argv: ['--notarize'] }), /--sign/);
});
test('signed channel metadata contains version, architecture and feed but no identity', () => {
  const result = releaseConfiguration({ ...base, argv: ['--sign', '--notarize'], env: {
    DREAMCUT_SIGN_IDENTITY: 'Developer ID Application: Example', DREAMCUT_NOTARY_PROFILE: 'notary-profile',
    DREAMCUT_RELEASE_CHANNEL: 'preview', DREAMCUT_UPDATE_FEED: 'https://updates.example/preview/darwin-arm64.json',
  } });
  assert.equal(result.notarize, true);
  assert.equal(result.manifest.version, base.version);
  assert.equal(result.manifest.arch, base.arch);
  assert.equal(JSON.stringify(result.manifest).includes('notary-profile'), false);
  assert.equal(JSON.stringify(result.manifest).includes('Developer ID'), false);
});

test('Windows local manifests are distinct and cannot silently enable Mac signing or updates',()=>{
 const result=releaseConfiguration({...base,platform:'win32',arch:'x64'});assert.equal(result.manifest.platform,'win32');assert.equal(result.manifest.feedUrl,null);
 assert.throws(()=>releaseConfiguration({...base,platform:'win32',argv:['--sign']}),/Windows qualification/);
});
