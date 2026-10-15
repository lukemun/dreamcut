import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { serveWarmStills, callWarmStill, canReuseWarmStill } from './warm-still-worker';

test('text, unfamiliar effects and fixtures keep fresh per-run readiness', () => {
  const request = { inputProps: { elements: [{ type: 'video_clip', props: { source_width: 320, source_height: 180 } }] } } as any;
  assert.equal(canReuseWarmStill(request), true);
  for (const element of [{ type: 'caption_text', props: {} }, { type: 'still', props: { titleText: 'Dynamic font' } }, { type: 'video_clip', props: { unknown: true } }, { type: 'video_clip', props: {}, transition_in: {} }]) {
    assert.equal(canReuseWarmStill({ ...request, inputProps: { elements: [element] } }), false);
  }
  assert.equal(canReuseWarmStill({ ...request, fixtureId: 'text-fixture' }), false);
});

test('separate clients reuse one worker; changed dependencies reset it and captures remain serial', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warm-still-'));
  const socket = path.join(dir, 'test.sock');
  let launches = 0, closes = 0, active = 0;
  const factory = async () => {
    launches++;
    const stats = { browserLaunches: 1, pageLoads: 0, captures: 0, pageReuses: 0 };
    return { stats, close: async () => { closes++; }, fingerprint: async () => 'verified', render: async () => {
      assert.equal(active++, 0); await new Promise(resolve => setTimeout(resolve, 10)); stats.captures++; active--;
    } };
  };
  const worker = await serveWarmStills(socket, 30_000, factory);
  t.after(async () => { await worker.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const options = { baseUrl: 'http://127.0.0.1:3123', output: 'unused', width: 1, height: 1, durationInFrames: 1, frame: 0, inputProps: {} };
  const request = { method: 'render' as const, generation: 'a'.repeat(64), options };
  const results = await Promise.all([callWarmStill(socket, request), callWarmStill(socket, request)]);
  assert.equal(launches, 1); assert.equal(results.reduce((n, r) => n + r.stats.captures, 0), 2);
  await callWarmStill(socket, { ...request, generation: 'b'.repeat(64) });
  assert.equal(launches, 2); assert.equal(closes, 1);
  assert.equal(fs.statSync(socket).mode & 0o077, 0);
});

test('worker errors poison the session and idle workers release their socket', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warm-failure-'));
  const socket = path.join(dir, 'test.sock');
  let closes = 0;
  await serveWarmStills(socket, 40, async () => ({ stats: { browserLaunches: 1, pageLoads: 0, captures: 0, pageReuses: 0 }, close: async () => { closes++; }, fingerprint: async () => { throw Error('font failure'); }, render: async () => {} }));
  await assert.rejects(callWarmStill(socket, { method: 'fingerprint', generation: 'a'.repeat(64), options: {} as any }), /font failure/);
  assert.equal(closes, 1);
  for (let attempt = 0; attempt < 50 && fs.existsSync(socket); attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(fs.existsSync(socket), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a Unicode media URL survives a split UTF-8 socket packet', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warm-unicode-'));
  const socketPath = path.join(dir, 'test.sock');
  let observed: unknown;
  const worker = await serveWarmStills(socketPath, 30_000, async () => ({ stats: { browserLaunches: 1, pageLoads: 0, captures: 0, pageReuses: 0 }, close: async () => {}, fingerprint: async () => 'verified', render: async options => { observed = options.inputProps.source_url; } }));
  t.after(async () => { await worker.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const bytes = Buffer.from(JSON.stringify({ method: 'render', generation: 'a'.repeat(64), options: { inputProps: { source_url: '/fő.mp4' } } }) + '\n');
  const split = bytes.indexOf(Buffer.from('ő')) + 1;
  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    socket.on('error', reject); socket.on('data', () => {}); socket.on('end', resolve);
    socket.on('connect', () => { socket.write(bytes.subarray(0, split)); setTimeout(() => socket.write(bytes.subarray(split)), 10); });
  });
  assert.equal(observed, '/fő.mp4');
});

test('a stalled capture is timed out and its browser is closed', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warm-timeout-'));
  const socket = path.join(dir, 'test.sock');
  let closes = 0;
  const worker = await serveWarmStills(socket, 30_000, async () => ({ stats: { browserLaunches: 1, pageLoads: 0, captures: 0, pageReuses: 0 }, close: async () => { closes++; }, fingerprint: async () => 'verified', render: async () => new Promise<void>(() => {}) }), 20);
  t.after(async () => { await worker.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  await assert.rejects(callWarmStill(socket, { method: 'render', generation: 'a'.repeat(64), options: {} as any }), /timed out/);
  assert.equal(closes, 1);
});
