import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopTelemetryOptions, sanitizeDesktopEvent } from './telemetry-policy.mjs';
test('desktop telemetry requires explicit opt-in and a destination; content capture is disabled', () => {
  assert.equal(desktopTelemetryOptions({}, 'test').enabled, false);
  assert.equal(desktopTelemetryOptions({SENTRY_DSN: 'https://example.test'}, 'test').enabled, false);
  const options = desktopTelemetryOptions({SENTRY_ENABLED: '1', SENTRY_DSN: 'https://example.test'}, 'test');
  assert.equal(options.enabled, true); assert.equal(options.defaultIntegrations, false);
  assert.equal(options.dataCollection.genAI.inputs, false); assert.equal(options.beforeBreadcrumb({}), null);
});
test('desktop event allowlist excludes project content, credentials and local identity', () => {
  const sensitive = 'PRIVATE-CONTENT-UNIQUE';
  const result = sanitizeDesktopEvent({request:{headers:{cookie:sensitive}},extra:{prompt:sensitive},user:{email:sensitive},breadcrumbs:[{message:sensitive}],contexts:{project:sensitive},tags:{operation:'service-exit',project:sensitive},message:sensitive,exception:{values:[{type:sensitive,value:sensitive,stacktrace:{frames:[{filename:'/Users/private-owner/editor/service.mjs',function:sensitive,context_line:sensitive,vars:{password:sensitive},lineno:12}]}}]}});
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(sensitive), false); assert.equal(serialized.includes('private-owner'), false);
  assert.equal(result.tags.operation, 'service-exit'); assert.equal(result.exception.values[0].stacktrace.frames[0].lineno, 12);
});


test('capture boundary removes attachment hints as well as private event fields', () => {
  const options = desktopTelemetryOptions({}, 'test');
  const hint = { attachments: [{ filename: 'private.txt', data: 'private content' }] };
  options.beforeSend({ extra: { secret: 'private content' } }, hint);
  assert.deepEqual(hint.attachments, []);
});
