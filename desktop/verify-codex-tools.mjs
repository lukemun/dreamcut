import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import sharp from 'sharp';
import { randomInt, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { discoverCodex } from './codex-discovery.mjs';
import { desktopRuntimeEnvironment } from './runtime-environment.mjs';
import { CODEX_TOOL_OUTPUT_INSTRUCTIONS } from './codex-tool-bridge.mjs';
import { openCodexSession } from './codex-session.mjs';
import { connectCodex } from './codex-connection.mjs';
import { connectEditingMcp } from '../mcp/harness-mcp.mjs';
import { openSession } from '../mcp/harness-session.mjs';

// Read-only synthetic MCP fixture. No real projects, proposal writes or approvals.
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-codex-tools-'));
const token = randomBytes(32).toString('hex');
const nonce = randomBytes(10).toString('hex');
let requests = 0;
const server = createServer((req, res) => {
  if (req.headers.cookie !== `dreamcut_desktop_session=${token}`) { res.writeHead(403); res.end('{}'); return; }
  requests++; res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ synthetic_fixture: true, verification_word: nonce, elements: [] }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let mcp, journal, session, client, ownedThread;
const events = [];
const imageCheck = process.argv.includes('--image');
const emitResults = process.argv.includes('--emit-results');
let expectedColors = [];
try {
  mcp = await connectEditingMcp({ projectId: 'fixture', families: ['editing-context'], serviceToken: token,
    baseUrl: `http://127.0.0.1:${server.address().port}`, projectsDirectory: scratch });
  await mcp.call('capability_catalog', { action: 'load', id: 'editing-context' }, (await mcp.list()).map(tool => tool.name));
  const readOnlyMcp = { list: async () => (await mcp.list()).filter(tool => tool.name === 'timeline_get'), call: async (...args) => {
    const result = await mcp.call(...args);
    if (!imageCheck || result.isError) return result;
    expectedColors = ['red', 'green', 'blue', 'yellow'];
    for (let i = expectedColors.length - 1; i > 0; i--) { const j = randomInt(i + 1); [expectedColors[i], expectedColors[j]] = [expectedColors[j], expectedColors[i]]; }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100">${expectedColors.map((color, i) => `<rect x="${i * 100}" width="100" height="100" fill="${color}"/>`).join('')}</svg>`;
    const data = (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
    return { ...result, content: [...result.content, { type: 'image', mimeType: 'image/png', data }] };
  } };
  journal = await openSession(path.join(scratch, 'journal'), { pinned: { projectId: 'fixture' }, limits: { tool_calls: 4, model_calls: 2 } });
  const env = desktopRuntimeEnvironment({ HOME: process.env.HOME, PATH: '/usr/bin:/bin' });
  const found = await discoverCodex({ env }); assert.equal(found.state, 'available');
  const open = () => openCodexSession({ executable: found.executable, projectDirectory: scratch,
    developerInstructions: emitResults ? CODEX_TOOL_OUTPUT_INSTRUCTIONS : undefined,
    userData: path.join(scratch, 'app'), env, editing: { mcp: readOnlyMcp, journal, projectId: 'fixture' }, onEvent: event => events.push(event),
    connect: async (executable, options) => {
      client = await connectCodex(executable, options);
      return { ...client, request: async (method, params) => {
        const result = await client.request(method, params);
        if (method === 'thread/start') ownedThread = result.thread.id;
        return result;
      } };
    } });
  for (let iteration = 0; iteration < 2; iteration++) {
    events.length = 0;
    session = await open();
    await session.send((imageCheck ? 'The tool also returns an image. After the verification word, name its stripe colors from left to right. ' : '') + 'Call timeline_get exactly once with project_id fixture now. Then reply with the verification_word returned by that tool. Do not guess or use other tools.');
    const deadline = Date.now() + 60000;
    while (!events.some(event => event.type === 'completed')) {
      if (events.some(event => event.type === 'disconnected')) throw Error('Tool session disconnected.');
      if (Date.now() > deadline) throw Error('Tool session timed out.');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(events.at(-1).status, 'completed');
    const responseText = events.filter(event => event.type === 'text').map(event => event.text).join('');
    assert.ok(responseText.includes(nonce), JSON.stringify({ responseText, calls: journal.snapshot().operations.map(op => ({ tool: op.tool, error: op.result?.isError, delivery: op.result?._meta?.dreamcut_delivery })) }));
    if (imageCheck) {
      const answer = events.filter(event => event.type === 'text').map(event => event.text).join('').toLowerCase();
      assert.deepEqual(answer.match(/\b(red|green|blue|yellow)\b/g), expectedColors);
      assert.equal(journal.snapshot().operations.at(-1).result._meta.dreamcut_delivery.images.length, 1);
    }
    assert.equal(journal.snapshot().operations.length, iteration + 1);
    assert.ok(journal.snapshot().operations.every(op => op.status === 'completed' && op.tool === 'timeline_get'));
    if (iteration === 0) await session.close();
  }
  assert.ok(requests >= 4);
  console.log(JSON.stringify({ version: found.version, registeredTool: 'timeline_get', journaledCalls: 2, resumedToolCall: true, resultDelivered: true, imageOrderRecognized: imageCheck, emitResults }));
} finally {
  if (client && ownedThread) await client.request('thread/archive', { threadId: ownedThread }).catch(() => { process.exitCode = 1; });
  if (session) await session.close(); else if (client) await client.close();
  if (journal) await journal.close(); if (mcp) await mcp.close();
  await new Promise(resolve => server.close(resolve));
  await fs.rm(scratch, { recursive: true, force: true });
}
