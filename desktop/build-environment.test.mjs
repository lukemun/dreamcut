import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopBuildEnvironment, releaseTelemetry } from './build-environment.mjs';
test('desktop builds cannot inherit provider credentials or compiled public configuration', () => {
  const env = desktopBuildEnvironment({ PATH: '/bin', HOME: '/home/test',
    SENTRY_AUTH_TOKEN: 'private', NEXT_PUBLIC_SENTRY_DSN: 'private',
    OPENAI_API_KEY: 'private', NODE_OPTIONS: '--require private-hook',
    TIMELINE_REVIEW_BUILD: '1', TIMELINE_PROJECTS_DIR: '/private/projects' }, { telemetry: null });
  assert.equal(env.PATH, '/bin');
  assert.equal(env.TIMELINE_NEXT_DIST_DIR, '.next-desktop');
  assert.equal(JSON.stringify(env).includes('private'), false);
  assert.equal(env.TIMELINE_REVIEW_BUILD, undefined);
  assert.equal(env.NEXT_PUBLIC_SENTRY_ENABLED, undefined);
});

test('releases carry the committed public error-report settings, not the builder\'s', () => {
  const telemetry = { sentry_dsn: 'https://abc123@o1.ingest.example.io/42', environment: 'production', traces_sample_rate: '0.1' };
  const env = desktopBuildEnvironment({ NEXT_PUBLIC_SENTRY_DSN: 'https://builder@o9.ingest.example.io/9', NEXT_PUBLIC_SENTRY_ENVIRONMENT: 'local' }, { telemetry, version: '1.2.3' });
  assert.equal(env.NEXT_PUBLIC_SENTRY_ENABLED, '1');
  assert.equal(env.NEXT_PUBLIC_SENTRY_DSN, telemetry.sentry_dsn);
  assert.equal(env.NEXT_PUBLIC_SENTRY_ENVIRONMENT, 'production');
  assert.equal(env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, '0.1');
  assert.equal(env.NEXT_PUBLIC_SENTRY_RELEASE, 'dreamcut@1.2.3');
  assert.equal(env.SENTRY_AUTH_TOKEN, undefined);
  const committed = releaseTelemetry();
  assert.ok(committed, 'packaging/release-telemetry.json names a Sentry ingestion address');
  assert.equal(committed.environment, 'production');
});

test('a local editor build reports as local, never as the release environment', () => {
  const telemetry = { sentry_dsn: 'https://abc123@o1.ingest.example.io/42', environment: 'production', traces_sample_rate: '0.1' };
  const env = desktopBuildEnvironment({ DREAMCUT_SENTRY_ENVIRONMENT: 'local' }, { telemetry, version: '1.2.3' });
  assert.equal(env.NEXT_PUBLIC_SENTRY_ENVIRONMENT, 'local');
});

test('source maps are requested from the build by a flag, never by passing the upload token', () => {
  const env = desktopBuildEnvironment({ SENTRY_AUTH_TOKEN: 'secret' }, { telemetry: null, sourceMaps: true });
  assert.equal(env.DREAMCUT_RELEASE_SOURCEMAPS, '1');
  assert.equal(JSON.stringify(env).includes('secret'), false);
  assert.equal(desktopBuildEnvironment({}, { telemetry: null }).DREAMCUT_RELEASE_SOURCEMAPS, undefined);
});
