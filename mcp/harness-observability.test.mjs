import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createUsageExporter } from './harness-observability.mjs';

async function fixture(t, status = 200, ack = '{}') {
  const received = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    received.push(JSON.parse(body)); res.writeHead(status); res.end(ack);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const directory = await mkdtemp(path.join(os.tmpdir(), 'harness-usage-'));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  return { received, options: { directory, sessionId: 'session', runId: 'run', model: 'test-model', provider: 'llamacpp', endpoint: `http://127.0.0.1:${server.address().port}/v1/logs` } };
}
const attrs = payload => Object.fromEntries(payload.resourceLogs[0].scopeLogs[0].logRecords[0].attributes.map(({ key, value }) => [key, Object.values(value)[0]]));

test('one metadata-only export per inference, across concurrent calls and new exporter', async t => {
  const { received, options } = await fixture(t);
  const observer = createUsageExporter(options);
  const event = { kind: 'model_response', elapsed_ms: 15, response: { id: 'r1', model: 'actual-model', choices: [{ message: { content: 'PRIVATE RESPONSE' } }], usage: { prompt_tokens: 24, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 3 } } }, prompt: 'PRIVATE PROMPT', images: ['PRIVATE PIXELS'] };
  const statuses = await Promise.all([observer.record(event), observer.record(event)]);
  await observer.flush();
  assert.deepEqual(statuses.map(x => x.status).sort(), ['duplicate', 'sent']);
  assert.equal((await createUsageExporter({ ...options, runId: 'resumed-run' }).record(event)).status, 'duplicate');
  assert.equal(received.length, 1);
  assert(!JSON.stringify(received).includes('PRIVATE'));
  assert.equal(attrs(received[0])['gen_ai.usage.input_tokens'], '24');
  assert.equal(attrs(received[0])['gen_ai.usage.output_tokens'], '7');
  assert.equal(attrs(received[0])['gen_ai.usage.cache_read.input_tokens'], '3');
  assert.equal(attrs(received[0])['gen_ai.response.model'], 'actual-model');
});

test('failure has no invented token counts; unavailable usage gets a coverage callback', async t => {
  const { received, options } = await fixture(t);
  const gaps = [];
  const observer = createUsageExporter({ ...options, onGap: event => gaps.push(event) });
  const status = await observer.record({ kind: 'model_error', request_id: 'request-1', error: { message: 'PRIVATE ERROR' } });
  assert.equal(status.usage, 'unknown');
  const attributes = attrs(received[0]);
  assert.equal(attributes['dreamcut.error'], true);
  assert(!Object.hasOwn(attributes, 'gen_ai.usage.input_tokens'));
  assert(!JSON.stringify(received).includes('PRIVATE ERROR'));
  assert.equal(gaps[0].reason, 'usage_unavailable');
  assert.equal((await observer.record({ kind: 'model_response' })).reason, 'missing_inference_id');
  assert.equal((await observer.record({ kind: 'model_request', request: 'secret' })).status, 'ignored');
});

test('collector rejection returns gap and never repeats inference/export attempt', async t => {
  const { received, options } = await fixture(t, 503);
  const observer = createUsageExporter({ ...options, onGap: () => { throw Error('callback failed'); } });
  const event = { kind: 'model_response', response: { id: 'r1', usage: { prompt_tokens: 1, completion_tokens: 2 } } };
  assert.equal((await observer.record(event)).reason, 'collector_rejected');
  assert.equal((await observer.record(event)).status, 'duplicate');
  assert.equal(received.length, 1);
});

test('partial OTLP rejection is surfaced, unsafe collectors rejected before networking', async t => {
  const { options } = await fixture(t, 200, '{"partialSuccess":{"rejectedLogRecords":"1"}}');
  assert.equal((await createUsageExporter(options).record({ kind: 'model_error', request_id: 'r1' })).reason, 'collector_partial_rejection');
  for (const endpoint of ['https://example.com/v1/logs', 'http://localhost/v1/logs', 'http://127.0.0.1/v1/logs?secret=1', 'http://user:pass@127.0.0.1/v1/logs']) assert.throws(() => createUsageExporter({ ...options, endpoint }));
});
