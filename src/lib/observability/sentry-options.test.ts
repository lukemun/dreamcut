import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopServiceSentryOptions, sentryOptions } from './sentry-options';

test('shared Sentry capture policy strips attachments outside the sanitized event', () => {
  const options = sentryOptions(undefined, undefined, undefined);
  const hint = { attachments: [{ filename: 'private.txt', data: 'synthetic private content' }] };
  options.beforeSend?.({}, hint);
  assert.deepEqual(hint.attachments, []);
  const transactionHint = { attachments: [{ filename: 'private.txt', data: 'synthetic private content' }] };
  options.beforeSendTransaction?.({ type: 'transaction' }, transactionHint);
  assert.deepEqual(transactionHint.attachments, []);
});

test('desktop service reports keep only a well-formed install id among tags', () => {
  const options = desktopServiceSentryOptions('https://abc@o1.ingest.example.io/1', '1', 'test');
  const send = (tags: Record<string, string>) => (options.beforeSend as (event: object, hint: object) => { tags?: Record<string, string> })({ tags }, {}).tags;
  assert.deepEqual(send({ install_id: '00000000-0000-4000-8000-000000000000', other: 'creator text' }), { component: 'desktop-service', install_id: '00000000-0000-4000-8000-000000000000' });
  assert.deepEqual(send({ install_id: 'creator text' }), { component: 'desktop-service' });
});
