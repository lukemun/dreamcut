import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const EVENT = 'gen_ai.client.inference.operation.details';
const token = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const attr = (key, value) => ({ key, value: typeof value === 'number' ? { intValue: String(value) } : typeof value === 'boolean' ? { boolValue: value } : { stringValue: String(value) } });

/** Metadata-only, at-most-once local export attempts. OTLP acknowledgement is not durable billing proof. */
export function createUsageExporter({ directory, sessionId, runId, model, provider = 'unknown', endpoint = 'http://127.0.0.1:4318/v1/logs', onGap = () => {}, timeoutMs = 1500 }) {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/v1/logs') throw new Error('Usage collector must be a loopback HTTP /v1/logs endpoint.');
  if (![directory, sessionId, runId, model].every(value => typeof value === 'string' && value.length)) throw new Error('Usage export requires directory, sessionId, runId and model.');
  const ledger = path.join(directory, 'usage-export-attempts');
  const pending = new Set();
  const gap = async (reason, id) => {
    const status = { status: 'gap', reason, ...(id ? { response_id: id } : {}) };
    try { await onGap(status); } catch { /* Reporting failure must never rerun inference. */ }
    return status;
  };
  async function send(event) {
    if (!['model_response', 'model_error'].includes(event?.kind)) return { status: 'ignored' };
    const response = event.response ?? {};
    const id = response.id ?? event.response_id ?? event.request_id;
    if (typeof id !== 'string' || !id) return gap('missing_inference_id');
    const digest = createHash('sha256').update(JSON.stringify([sessionId, provider, id])).digest('hex');
    const claim = path.join(ledger, `${digest}.json`);
    try {
      await mkdir(ledger, { recursive: true, mode: 0o700 });
      await writeFile(claim, JSON.stringify({ status: 'attempted', response_id: id }), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (error.code === 'EEXIST') return { status: 'duplicate', response_id: id };
      return gap('local_claim_failed', id);
    }
    const usage = event.usage ?? response.usage ?? {};
    const attributes = {
      'event.name': EVENT,
      'gen_ai.provider.name': provider,
      'gen_ai.operation.name': 'chat',
      'gen_ai.conversation.id': sessionId,
      'dreamcut.run_id': runId,
      'gen_ai.request.model': model,
      'gen_ai.response.id': id,
      'dreamcut.error': event.kind === 'model_error' || Boolean(response.error),
    };
    if (typeof response.model === 'string') attributes['gen_ai.response.model'] = response.model;
    const counts = {
      'gen_ai.usage.input_tokens': token(usage.prompt_tokens ?? usage.input_tokens),
      'gen_ai.usage.output_tokens': token(usage.completion_tokens ?? usage.output_tokens),
      'gen_ai.usage.cache_read.input_tokens': token(usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens),
      'gen_ai.usage.reasoning.output_tokens': token(usage.completion_tokens_details?.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens),
    };
    for (const [key, value] of Object.entries(counts)) if (value !== undefined) attributes[key] = value;
    if (Number.isFinite(event.elapsed_ms) && event.elapsed_ms >= 0) attributes.duration_ms = Math.round(event.elapsed_ms);
    const payload = { resourceLogs: [{ resource: { attributes: [attr('service.name', 'dreamcut-editing-harness')] }, scopeLogs: [{ scope: { name: 'dreamcut.harness', version: '1' }, logRecords: [{ timeUnixNano: String(BigInt(Date.now()) * 1_000_000n), eventName: EVENT, body: { stringValue: '' }, attributes: Object.entries(attributes).map(([key, value]) => attr(key, value)) }] }] }] };
    let status;
    try {
      const reply = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
      if (!reply.ok) status = await gap('collector_rejected', id);
      else {
        const body = await reply.text();
        const ack = body ? JSON.parse(body) : {};
        if (Number(ack.partialSuccess?.rejectedLogRecords ?? 0) > 0 || ack.partialSuccess?.errorMessage) status = await gap('collector_partial_rejection', id);
        else status = { status: 'sent', response_id: id };
      }
    } catch { status = await gap('collector_unavailable_or_unknown_ack', id); }
    // This marker is coverage evidence, not a replay queue. A crash leaves attempted/unknown.
    try { await writeFile(claim, JSON.stringify(status), { mode: 0o600 }); } catch { return gap('local_receipt_failed', id); }
    if (counts['gen_ai.usage.input_tokens'] === undefined || counts['gen_ai.usage.output_tokens'] === undefined) {
      await gap('usage_unavailable', id);
      return { ...status, usage: 'unknown' };
    }
    return status;
  }
  return {
    record(event) {
      const promise = send(event).catch(() => gap('export_internal_error'));
      pending.add(promise);
      promise.finally(() => pending.delete(promise));
      return promise;
    },
    async flush() { await Promise.all([...pending]); },
  };
}

export const createHarnessObserver = createUsageExporter;
