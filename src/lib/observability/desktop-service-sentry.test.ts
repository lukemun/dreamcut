import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gunzipSync, inflateSync } from 'node:zlib';
import os from 'node:os';
import * as Sentry from '@sentry/nextjs';
import { desktopServiceSentryOptions } from './sentry-options';

test('desktop service real SDK delivers only reconstructed errors to a local collector', async () => {
  const keys = ['DREAMCUT_SERVICE_ROOT', 'SENTRY_ENABLED', 'SENTRY_DSN', 'SENTRY_ENVIRONMENT'] as const;
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  const bodies: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      let bytes = Buffer.concat(chunks);
      if (request.headers['content-encoding'] === 'gzip') bytes = gunzipSync(bytes);
      if (request.headers['content-encoding'] === 'deflate') bytes = inflateSync(bytes);
      bodies.push(bytes.toString('utf8')); response.end('{}');
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const dsn = `http://public@127.0.0.1:${address.port}/1`;
  try {
    assert.equal(desktopServiceSentryOptions(dsn, undefined, 'test').enabled, false);
    Sentry.captureException(new Error('Opted out')); await Sentry.flush(1000);
    assert.equal(bodies.length, 0);
    process.env.DREAMCUT_SERVICE_ROOT = process.cwd();
    process.env.SENTRY_ENABLED = '1'; process.env.SENTRY_DSN = dsn; process.env.SENTRY_ENVIRONMENT = 'test';
    await import('../../sentry.server.config');
    // Production keeps a fifth of errors (ERROR_SAMPLE_RATE); this check needs the one it sends.
    const client = Sentry.getClient(); assert.ok(client); client.getOptions().sampleRate = 1;
    const sentinel = 'SYNTHETIC_CREATOR_TEXT_NEVER_TRANSMIT';
    Sentry.withScope(scope => {
      scope.setUser({ id: sentinel }); scope.setTag('arbitrary', sentinel);
      scope.setExtra('arbitrary', sentinel); scope.setContext('arbitrary', { value: sentinel });
      scope.addAttachment({ filename: `${sentinel}.txt`, data: sentinel });
      Sentry.captureException(new Error(sentinel));
    });
    assert.ok(await Sentry.flush(3000));
    const serialized = bodies.join('\n');
    assert.ok(bodies.length > 0);
    assert.equal(serialized.includes(sentinel), false);
    assert.equal(serialized.includes(os.homedir()), false);
    assert.equal(serialized.includes(os.hostname()), false);
    const events = bodies.flatMap(body => body.split('\n').flatMap(line => {
      try { const value = JSON.parse(line); return value.message ? [value] : []; } catch { return []; }
    }));
    assert.equal(events.length, 1);
    assert.equal(events[0].message, 'DreamCut desktop service error');
    assert.deepEqual(events[0].tags, { component: 'desktop-service' });
    assert.equal(events[0].exception.values[0].type, 'DesktopServiceError');
  } finally {
    await Sentry.close(1000);
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
