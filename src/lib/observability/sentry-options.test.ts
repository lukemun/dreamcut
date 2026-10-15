import test from 'node:test';
import assert from 'node:assert/strict';
import { sentryOptions } from './sentry-options';

test('shared Sentry capture policy strips attachments outside the sanitized event', () => {
  const options = sentryOptions(undefined, undefined, undefined);
  const hint = { attachments: [{ filename: 'private.txt', data: 'synthetic private content' }] };
  options.beforeSend?.({}, hint);
  assert.deepEqual(hint.attachments, []);
  const transactionHint = { attachments: [{ filename: 'private.txt', data: 'synthetic private content' }] };
  options.beforeSendTransaction?.({ type: 'transaction' }, transactionHint);
  assert.deepEqual(transactionHint.attachments, []);
});
