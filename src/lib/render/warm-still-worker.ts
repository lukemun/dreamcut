import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createBrowserStillSession, type BrowserStillOptions } from './browser-renderer';
import { createStillDependencyHasher, readVerifiedStillEnvironment } from '../instruments/still-cache';

type Session = Awaited<ReturnType<typeof createBrowserStillSession>>;
type Message = { method: 'fingerprint' | 'render'; generation: string; options: BrowserStillOptions };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const MAX_MESSAGE = 64 * 1024 * 1024;
const warmProps = new Set(['source_width','source_height','source_duration_seconds','source_aspect_ratio','media_scale','media_offset_x','media_offset_y','media_opacity','objectFit','has_alpha']);

/** Text can depend on changing remote font bytes. Keep its existing per-run
 * readiness until those resources have a cross-run freshness contract. */
export function canReuseWarmStill(options: BrowserStillOptions) {
  return !options.fixtureId && Object.keys(options.inputProps).every(key => ['elements','laneOrderKeys'].includes(key))
    && Array.isArray(options.inputProps.elements) && options.inputProps.elements.every(element =>
      ['video_clip','still'].includes(element.type) && !element.transition_in && !element.transition_out
      && Object.keys(element.props ?? {}).every(key => warmProps.has(key)));
}

/** Private local socket, one serialized renderer, automatic idle cleanup. */
export async function serveWarmStills(socketPath: string, idleMs = 30_000, factory: () => Promise<Session> = createBrowserStillSession, requestTimeoutMs = 90_000) {
  let session: Session | undefined, generation = '', queued = 0, lastUse = Date.now();
  let queue = Promise.resolve();
  const server = net.createServer(socket => {
    socket.setEncoding('utf8');
    let input = '', handled = false, size = 0;
    socket.setTimeout(120_000, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('data', chunk => {
      if (handled) return;
      size += Buffer.byteLength(chunk);
      input += chunk;
      if (size > MAX_MESSAGE) { handled = true; socket.destroy(); return; }
      if (!input.includes('\n')) return;
      handled = true; queued++; lastUse = Date.now();
      queue = queue.then(async () => {
        try {
          if (socket.destroyed) return;
          const message = JSON.parse(input.slice(0, input.indexOf('\n'))) as Message;
          if (!['fingerprint','render'].includes(message.method) || !/^[a-f0-9]{64}$/.test(message.generation)) throw Error('Invalid still-worker request');
          let launches = 0;
          if (!session || generation !== message.generation) {
            await session?.close(); session = undefined;
            session = await factory(); generation = message.generation; launches = 1;
          }
          const before = { ...session.stats };
          let timeout: ReturnType<typeof setTimeout> | undefined;
          let value;
          try {
            value = await Promise.race([
              session[message.method](message.options),
              new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(Error('Warm renderer capture timed out')), requestTimeoutMs); }),
            ]);
          } finally { clearTimeout(timeout); }
          socket.end(JSON.stringify({ value, stats: { browserLaunches: launches, pageLoads: session.stats.pageLoads - before.pageLoads, captures: session.stats.captures - before.captures, pageReuses: session.stats.pageReuses - before.pageReuses } }) + '\n');
        } catch (error) {
          await session?.close().catch(() => {}); session = undefined;
          socket.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) + '\n');
        } finally { queued--; lastUse = Date.now(); }
      });
    });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(socketPath, () => { server.off('error', reject); fs.chmodSync(socketPath, 0o600); resolve(); }); });
  const close = async () => {
    clearInterval(timer);
    await new Promise<void>(resolve => server.close(() => resolve()));
    await queue; await session?.close();
    // net.Server removes its own socket when it closes. Unlinking again here
    // could delete a successor worker's socket after the browser finishes closing.
  };
  const timer = setInterval(() => { if (!queued && Date.now() - lastUse >= idleMs) void close(); }, Math.min(idleMs, 1000));
  return { close };
}

export function callWarmStill(socketPath: string, message: Message): Promise<{ value?: string | null; stats: Session['stats'] }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    socket.setEncoding('utf8');
    let output = '';
    socket.setTimeout(120_000, () => socket.destroy(new Error('Warm renderer timed out')));
    socket.on('error', reject);
    socket.on('connect', () => socket.write(JSON.stringify(message) + '\n'));
    socket.on('data', chunk => { output += chunk.toString(); if (output.length > 1_000_000) socket.destroy(new Error('Oversized warm-renderer response')); });
    socket.on('end', () => {
      try { const response = JSON.parse(output); if (response.error) throw Error(response.error); resolve(response); } catch (error) { reject(error); }
    });
  });
}

/** Opt-in across CLI runs. Unverifiable inputs and bootstrap failures use a fresh
 * local session. Code revisions have separate workers; media changes reset pages. */
async function initializeWarmStillSession(root: string, baseUrl: string) {
  const environment = await readVerifiedStillEnvironment(baseUrl, root);
  if (process.platform === 'win32' || !environment?.runtimeId) return createBrowserStillSession();
  const hash = createStillDependencyHasher(root);
  const code = hash({ baseUrl, width: 1, height: 1, durationInFrames: 1, frame: 0, inputProps: {}, output: 'unused' });
  if (!code) return createBrowserStillSession();
  const worker = path.join(root, 'scripts/still-worker.ts');
  if (!fs.existsSync(worker)) return createBrowserStillSession();
  const identity = sha(JSON.stringify([root, baseUrl, environment.runtimeId, code, fs.readFileSync(worker, 'utf8')]));
  const directory = path.join(os.tmpdir(), `oe-still-${identity.slice(0, 16)}`);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const permissions = fs.statSync(directory);
  if ((permissions.mode & 0o077) || permissions.uid !== process.getuid?.()) return createBrowserStillSession();
  const socketPath = path.join(directory, 'worker.sock'), lock = path.join(directory, 'starting.json');
  let local: Session | undefined, closed = false;
  const stats: Session['stats'] = { browserLaunches: 0, pageLoads: 0, captures: 0, pageReuses: 0 };
  const localCall = async (method: Message['method'], options: BrowserStillOptions) => {
    const before = local ? { ...local.stats } : { browserLaunches: 0, pageLoads: 0, captures: 0, pageReuses: 0 };
    local ??= await createBrowserStillSession();
    const value = await local[method](options);
    for (const key of Object.keys(stats) as Array<keyof typeof stats>) stats[key] += local.stats[key] - before[key];
    return value;
  };
  async function call(method: Message['method'], options: BrowserStillOptions) {
    if (closed) throw Error('Still render session is closed');
    if (hash({ ...options, inputProps: {} }) !== code) throw Error('Renderer code changed during this check; restart the instrument');
    const generation = hash(options);
    if (!generation || local || !canReuseWarmStill(options)) return localCall(method, options);
    const message = { method, generation, options };
    let result;
    try { result = await callWarmStill(socketPath, message); }
    catch (error) {
      if (!['ENOENT','ECONNREFUSED'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      let owner = false;
      try {
        try {
          const saved = JSON.parse(fs.readFileSync(lock, 'utf8'));
          try { process.kill(saved.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') fs.rmSync(lock, { force: true }); }
        } catch { /* Missing/in-progress lock. */ }
        try { fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 }); owner = true; } catch { /* Another caller starts the worker. */ }
        if (owner) {
          fs.rmSync(socketPath, { force: true });
          const child = spawn(process.execPath, ['--import', 'tsx', worker, socketPath], { cwd: root, detached: true, stdio: 'ignore', env: process.env });
          child.on('error', () => {}); child.unref();
        }
        for (let attempt = 0; attempt < 100; attempt++) {
          await pause(50);
          try { result = await callWarmStill(socketPath, message); break; }
          catch (error) { if (!['ENOENT','ECONNREFUSED'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
        }
      } finally { if (owner) fs.rmSync(lock, { force: true }); }
      if (!result) return localCall(method, options);
    }
    for (const key of Object.keys(stats) as Array<keyof typeof stats>) stats[key] += result.stats[key];
    return result.value;
  }
  return { stats, close: async () => { closed = true; await local?.close(); },
    fingerprint: async (options: BrowserStillOptions) => (await call('fingerprint', options)) ?? null,
    render: async (options: BrowserStillOptions) => { await call('render', options); } };
}

export async function createWarmStillSession(root: string, baseUrl: string) {
  try { return await initializeWarmStillSession(root, baseUrl); }
  catch { return createBrowserStillSession(); }
}
