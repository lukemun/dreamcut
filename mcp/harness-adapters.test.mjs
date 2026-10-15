import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { adaptMcpResult, classifyRecovery, toProviderTools } from './harness-adapters.mjs';
const call = { id: 'call-1', name: 'timeline_evidence' };
const png = async () => ({ type: 'image', mimeType: 'image/png', data: (await sharp({ create: { width: 3, height: 2, channels: 3, background: '#f00' } }).png().toBuffer()).toString('base64') });

test('OpenAI keeps call pairing, structured error and actual pixels in companion', async () => {
  const image = await png();
  const structuredContent = { code: 'EVIDENCE_PARTIAL', state_changed: false, recovery: { action: 'inspect' } };
  const result = await adaptMcpResult({ provider: 'openai', call, result: { isError: true, structuredContent, content: [{ type: 'text', text: 'frame at 1s' }, image] } });
  assert.equal(result.messages[0].tool_call_id, call.id);
  assert.deepEqual(JSON.parse(result.messages[0].content).structuredContent, structuredContent);
  assert(!result.messages[0].content.includes(image.data));
  assert.equal(result.messages[1].content[1].image_url.url, `data:image/png;base64,${image.data}`);
  assert.equal(result.images[0].width, 3);
  assert.equal(result.images[0].height, 2);
  assert.equal(result.images[0].delivery, 'encoded');
});

test('Ollama delivers images in image field without text flattening', async () => {
  const image = await png();
  const result = await adaptMcpResult({ provider: 'ollama', call, result: { content: [image] } });
  assert.deepEqual(result.messages[0].images, [image.data]);
  assert.equal(result.messages[0].tool_name, call.name);
  assert(!result.messages[0].content.includes(image.data));
});

test('rejects invalid encoding, spoofed MIME, corrupt bytes, size limits and unsupported content', async () => {
  const image = await png();
  for (const bad of [ { ...image, data: image.data + '\n' }, { ...image, mimeType: 'image/jpeg' }, { ...image, data: Buffer.from('not an image').toString('base64') }, { type: 'audio', data: 'AAAA', mimeType: 'audio/wav' }, { type: 'resource_link', uri: 'file:///secret' } ]) {
    await assert.rejects(adaptMcpResult({ provider: 'openai', call, result: { content: [bad] } }), { name: 'HarnessAdapterError' });
  }
  await assert.rejects(adaptMcpResult({ provider: 'openai', call, result: { content: [image] }, limits: { maxImageBytes: 1 } }));
  await assert.rejects(adaptMcpResult({ provider: 'openai', call, result: { content: [image] }, limits: { maxPixels: 1 } }));
  await assert.rejects(adaptMcpResult({ provider: 'openai', call, result: { content: [image, image] }, limits: { maxImages: 1 } }));
});

test('projects exact tool schema without mutating registry', () => {
  const tools = [{ name: 'inspect', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } }];
  const projected = toProviderTools(tools);
  assert.deepEqual(projected[0].function.parameters, tools[0].inputSchema);
  projected[0].function.parameters.required.push('other');
  assert.deepEqual(tools[0].inputSchema.required, ['id']);
  assert.throws(() => toProviderTools([...tools, ...tools]));
});

test('recovery retries safe reads twice, never unknown mutation, repairs once', () => {
  assert.equal(classifyRecovery({ operation: 'read', error: { code: 'ETIMEDOUT' } }).action, 'retry');
  assert.equal(classifyRecovery({ operation: 'read', error: { code: 'ETIMEDOUT' }, retries: 2 }).action, 'stop');
  assert.equal(classifyRecovery({ operation: 'mutation', error: { code: 'ETIMEDOUT' } }).action, 'reconcile');
  assert.equal(classifyRecovery({ operation: 'mutation', error: { code: 'TOOL_FAILED', retryable: true, state_changed: 'unknown' } }).action, 'reconcile');
  assert.equal(classifyRecovery({ operation: 'mutation', error: { code: 'TOOL_FAILED', retryable: true, state_changed: false } }).action, 'stop');
  const invalid = { code: 'INVALID_ARGUMENTS', state_changed: false };
  assert.equal(classifyRecovery({ operation: 'mutation', error: invalid }).action, 'repair');
  assert.equal(classifyRecovery({ operation: 'mutation', error: invalid, repairs: 1 }).action, 'stop');
  assert.equal(classifyRecovery({ operation: 'read', error: { code: 'ETIMEDOUT' }, repeated: true }).action, 'stop');
  assert.equal(classifyRecovery({ operation: 'read', error: { code: 'ETIMEDOUT' }, budgetRemaining: false }).action, 'stop');
  assert.equal(classifyRecovery({ operation: 'mutation', error: { code: 'STALE_REVISION' } }).action, 'refresh');
  assert.equal(classifyRecovery({ operation: 'read', error: { code: 'PERMISSION_DENIED', retryable: true } }).action, 'stop');
});

test('llama.cpp uses native multimodal tool content without an invented user turn', async () => {
  const image = await png();
  const result = await adaptMcpResult({ provider: 'llamacpp', call, result: { content: [{ type: 'text', text: 'frame 1' }, image] } });
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].role, 'tool');
  assert.equal(result.messages[0].tool_call_id, call.id);
  assert.equal(result.messages[0].content[1].image_url.url, `data:image/png;base64,${image.data}`);
});

test('opt-in grammar projection narrows existing string maximums, retaining original schema', () => {
  const schema = { type: 'object', properties: { text: { type: 'string', minLength: 1, maxLength: 2000 }, unbounded: { type: 'string' }, small: { type: 'string', maxLength: 12 } } };
  const tools = [{ name: 'inspect', inputSchema: schema }];
  assert.equal(toProviderTools(tools)[0].function.parameters.properties.text.maxLength, 2000);
  const projected = toProviderTools(tools, { maxStringLength: 256 })[0].function.parameters;
  assert.equal(projected.properties.text.maxLength, 256);
  assert.equal(projected.properties.small.maxLength, 12);
  assert.equal(projected.properties.unbounded.maxLength, undefined);
  assert.equal(schema.properties.text.maxLength, 2000);
  assert.throws(() => toProviderTools([{ name: 'impossible', inputSchema: { type: 'object', properties: { text: { type: 'string', minLength: 1000, maxLength: 2000 } } } }], { maxStringLength: 256 }));
});

test('Claude receives validated MCP image blocks in original order and structured facts', async () => {
  const image = await png();
  const result = await adaptMcpResult({ provider: 'claude', call, result: { isError: true, content: [{ type: 'text', text: 'before' }, image], structuredContent: { coverage: 'sampled' } } });
  assert.equal(result.success, false);
  assert.deepEqual(result.content.map(block => block.type), ['text', 'image', 'text']);
  assert.deepEqual(result.content[1], { type: 'image', data: image.data, mimeType: 'image/png' });
  assert.equal(result.images[0].delivery, 'encoded');
  assert.deepEqual(JSON.parse(result.content[2].text), { coverage: 'sampled' });
  await assert.rejects(adaptMcpResult({ provider: 'claude', call, result: { content: [{ type: 'audio', data: 'x' }] } }), { code: 'UNSUPPORTED_MODALITY' });
});

test('Codex receives validated pixels in original block order and structured facts', async () => {
  const image = await png();
  const result = await adaptMcpResult({ provider: 'codex', call, result: { content: [{ type: 'text', text: 'before' }, image, { type: 'text', text: 'after' }], structuredContent: { coverage: 'sampled' } } });
  assert.equal(result.success, true);
  assert.deepEqual(result.contentItems.map(item => item.type), ['inputText', 'inputImage', 'inputText', 'inputText']);
  assert.equal(result.contentItems[1].imageUrl, `data:image/png;base64,${image.data}`);
  assert.equal(result.images[0].delivery, 'encoded');
  assert.equal(result.images[0].width, 3);
  assert.deepEqual(JSON.parse(result.contentItems[3].text), { coverage: 'sampled' });
  await assert.rejects(adaptMcpResult({ provider: 'codex', call, result: { content: [{ ...image, mimeType: 'image/jpeg' }] } }), { code: 'INVALID_IMAGE' });
});

test('opt-in generation projection collapses deep schemas and drops patterns, leaving the original intact', () => {
  const inputSchema = { type: 'object', properties: { id: { type: 'string', pattern: '^[a-z]+$', format: 'uuid' },
    proposal: { type: 'object', description: 'Proposal body', properties: { options: { type: 'array', items: { type: 'object', properties: { deep: { type: 'string', pattern: '^x$' } } } } } } } };
  const original = structuredClone(inputSchema);
  const projected = toProviderTools([{ name: 'create', inputSchema }], { maxSchemaDepth: 2, dropPatterns: true })[0].function.parameters;
  assert.deepEqual(projected.properties.id, { type: 'string' });
  assert.deepEqual(projected.properties.proposal.properties.options, { type: 'array', items: { type: 'object' } });
  assert.equal(projected.properties.proposal.description, 'Proposal body');
  assert.deepEqual(inputSchema, original);
});
