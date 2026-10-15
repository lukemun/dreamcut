import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopBuildEnvironment } from './build-environment.mjs';
test('desktop builds cannot inherit provider credentials or compiled public configuration', () => {
  const env = desktopBuildEnvironment({ PATH: '/bin', HOME: '/home/test',
    SENTRY_AUTH_TOKEN: 'private', NEXT_PUBLIC_SENTRY_DSN: 'private',
    OPENAI_API_KEY: 'private', NODE_OPTIONS: '--require private-hook',
    TIMELINE_REVIEW_BUILD: '1', TIMELINE_PROJECTS_DIR: '/private/projects' });
  assert.equal(env.PATH, '/bin');
  assert.equal(env.TIMELINE_NEXT_DIST_DIR, '.next-desktop');
  assert.equal(JSON.stringify(env).includes('private'), false);
  assert.equal(env.TIMELINE_REVIEW_BUILD, undefined);
});
