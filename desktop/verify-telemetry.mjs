import { app } from 'electron';
import { createServer } from 'node:http';
import { gunzipSync, inflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { randomInt } from 'node:crypto';
import assert from 'node:assert/strict';

// Real SDK + local HTTP collector. Synthetic content only; no external Sentry DSN.
void (async () => {
  const bodies = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      let bytes = Buffer.concat(chunks);
      if (request.headers['content-encoding'] === 'gzip') bytes = gunzipSync(bytes);
      if (request.headers['content-encoding'] === 'deflate') bytes = inflateSync(bytes);
      bodies.push(bytes.toString('utf8'));
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{}');
    });
  });
  let Sentry, exitCode = 1;
  try {
    const port = randomInt(49152, 65535);
    const listening = new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    const root = path.resolve(process.argv[2] || 'desktop');
    const moduleUrl = pathToFileURL(path.join(root, 'telemetry.mjs'));
    const { initializeDesktopTelemetry, reportDesktopFailure, flushDesktopTelemetry } = createRequire(import.meta.url)(path.join(root, 'telemetry.mjs'));
    Sentry = createRequire(moduleUrl)('@sentry/electron/main');
    const dsn = `http://public@127.0.0.1:${port}/1`;
    initializeDesktopTelemetry({ SENTRY_DSN: dsn }, 'dreamcut@fixture');
    reportDesktopFailure('startup'); assert.equal(bodies.length, 0);
    initializeDesktopTelemetry({ SENTRY_ENABLED: '1', SENTRY_DSN: dsn }, 'dreamcut@fixture');
    await listening;
    const secret = 'SYNTHETIC-PRIVATE-CONTENT-NEVER-SEND';
    Sentry.withScope(scope => {
      scope.setUser({ email: `${secret}@example.test`, id: secret });
      scope.setExtra('prompt', secret); scope.setContext('project', { path: `/private/${secret}` });
      scope.setTag('project', secret);
      scope.addAttachment({ filename: `${secret}.txt`, data: secret });
      Sentry.addBreadcrumb({ message: secret });
      reportDesktopFailure('service-exit');
    });
    await flushDesktopTelemetry();
    assert.ok(bodies.length > 0, 'No SDK envelope reached the local collector.');
    const output = bodies.join('\n');
    assert.equal(output.includes(secret), false, 'Private sentinel escaped into the SDK envelope.');
    assert.equal(output.includes(os.homedir()), false, 'Home path escaped into the SDK envelope.');
    assert.equal(output.includes(os.hostname()), false, 'Host identity escaped into the SDK envelope.');
    const events = bodies.flatMap(body => body.split('\n').flatMap(line => {
      try { const item = JSON.parse(line); return item.event_id && item.message ? [item] : []; } catch { return []; }
    }));
    assert.equal(events.length, 1, 'Expected one sanitized error event.');
    assert.equal(events[0].message, 'DreamCut desktop service-exit failed');
    assert.deepEqual(events[0].tags, { component: 'desktop', operation: 'service-exit' });
    console.log(JSON.stringify({ sdk: 'sentry-electron', optedOutSentNothing: true, localCaptureVerified: true, sanitizedEvents: 1, privateContextExcluded: true, externalTransmission: false }));
    exitCode = 0;
  } catch (error) { console.error(error.message); }
  finally { if (Sentry) await Sentry.close(1000); await new Promise(resolve => server.close(resolve)); app.exit(exitCode); }
})();
