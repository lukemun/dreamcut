#!/usr/bin/env node
/**
 * First-run check of the packed `dreamcut` launcher, as a new creator would meet it: a fresh app-data
 * folder, the launcher installed from its npm tarball (no checkout), and the runtime downloaded from a
 * local stand-in for the public download location. Checks: checksum-verified install, a tampered download
 * refused, `dreamcut mcp` answering an agent, Library setup, a single-use sign-in link, the production
 * editor serving pages, a newer version published while the editor runs (downloaded in the background
 * without the base layer, offered, and applied in place with the browser still signed in), and a clean
 * stop. Uses only temporary folders.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(repo, 'dist');
const tarball = fs.readdirSync(path.join(dist, 'npm')).find(name => /^dreamcut-.*\.tgz$/.test(name));
if (!tarball) throw new Error('Run packaging/pack-launcher.mjs first.');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamcut-first-run-'));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

// Stand-in for the public download location; /tampered/ serves the right names with the wrong bytes.
const key = `${process.platform}-${process.arch}`;
const updates = path.join(temp, 'published updates');
fs.mkdirSync(updates);
let feed = JSON.parse(fs.readFileSync(path.join(dist, 'web-runtime', 'latest.json'), 'utf8'));
const downloads = new Map();
const server = http.createServer((request, response) => {
  const tampered = request.url.startsWith('/tampered/');
  const name = path.basename(request.url);
  if (name === 'latest.json') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(feed)); return; }
  const file = [path.join(dist, 'web-runtime', name), path.join(updates, name)].find(candidate => fs.existsSync(candidate));
  if (!file) { response.writeHead(404); response.end(); return; }
  if (!tampered) downloads.set(name, (downloads.get(name) ?? 0) + 1);
  response.writeHead(200);
  if (tampered) response.end(Buffer.alloc(fs.statSync(file).size, 7));
  else fs.createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const prefix = path.join(temp, 'prefix');
  execFileSync('npm', ['install', '--prefix', prefix, '--no-audit', '--no-fund', path.join(dist, 'npm', tarball)], { stdio: 'ignore' });
  const bin = path.join(prefix, 'node_modules', '.bin', process.platform === 'win32' ? 'dreamcut.cmd' : 'dreamcut');
  const env = { ...process.env, DREAMCUT_APP_DATA_DIR: path.join(temp, 'app data'), DREAMCUT_RUNTIME_BASE_URL: base, DREAMCUT_UPDATE_CHECK_SECONDS: '2' };
  for (const key of ['TIMELINE_PROJECTS_DIR', 'DREAMCUT_LIBRARY_DIR', 'TIMELINE_EDITOR_BASE_URL', 'DREAMCUT_RUNTIME_DIR']) delete env[key];

  // Async, never execFileSync: the download server above runs in this same process.
  const run = (args, runEnv) => new Promise(resolve => {
    const child = spawn(bin, args, { env: runEnv, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; child.stderr.on('data', chunk => { err += chunk; });
    child.on('exit', code => resolve({ code, stderr: err }));
  });
  const tamperedEnv = { ...env, DREAMCUT_APP_DATA_DIR: path.join(temp, 'tampered app data'), DREAMCUT_RUNTIME_BASE_URL: `${base}/tampered` };
  const tampered = await run(['install'], tamperedEnv);
  const tamperedOk = tampered.code !== 0 && /checksum/.test(tampered.stderr);
  const tamperedRuntimes = path.join(temp, 'tampered app data', 'runtimes');
  const installedAnything = ['app', 'base'].some(layer => fs.existsSync(path.join(tamperedRuntimes, layer)) && fs.readdirSync(path.join(tamperedRuntimes, layer)).length > 0);
  check('a tampered download is refused and nothing is installed', tamperedOk && !installedAnything);

  let started = Date.now();
  const install = await run(['install'], env);
  check('the runtime installs from the launcher', install.code === 0, `${Math.round((Date.now() - started) / 1000)} s${install.code ? `: ${install.stderr.trim().split('\n').pop()}` : ''}`);
  if (install.code) throw new Error('Install failed; later checks need the runtime.');
  const runtimes = path.join(temp, 'app data', 'runtimes');
  const firstApp = path.join(runtimes, 'app', `${feed.version}-${key}`);
  check('the app layer links the shared base layer', fs.lstatSync(path.join(firstApp, 'node_modules')).isSymbolicLink()
    && fs.existsSync(path.join(runtimes, 'base', `${feed.platforms[key].base.id}-${key}`, 'node_modules')));

  // An agent connecting to `dreamcut mcp`.
  const mcp = spawn(bin, ['mcp'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = ''; mcp.stderr.on('data', chunk => { stderr += chunk; });
  const lines = readline.createInterface({ input: mcp.stdout }), pending = new Map(); let id = 0;
  lines.on('line', line => { try { const message = JSON.parse(line); pending.get(message.id)?.(message); } catch { check('stdout carries only JSON-RPC', false, line.slice(0, 80)); } });
  const rpc = (method, params) => new Promise(resolve => { const n = ++id; pending.set(n, resolve); mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: n, method, params })}\n`); });
  const call = async (name, args) => { const reply = await rpc('tools/call', { name, arguments: args }); return { error: !!reply.result?.isError, text: reply.result?.content?.map(item => item.text).join('') ?? JSON.stringify(reply.error) }; };
  started = Date.now();
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'first-run', version: '1' } });
  check('the MCP server answers immediately', !!init.result, `${Date.now() - started} ms`);
  const status = await call('library_status', {});
  check('library_status starts the production editor', !status.error, `${Math.round((Date.now() - started) / 1000)} s`);
  let statusBody = null;
  try { statusBody = JSON.parse(status.text); } catch { /* reported below */ }
  check('library_status lists the projects an agent can open', Array.isArray(statusBody?.projects) && Number.isInteger(statusBody?.project_count));
  const libraryDir = path.join(temp, 'Movies', 'DreamCut Library');
  const created = await call('library_setup', { action: 'create', dir: libraryDir });
  check('a Library is created where the creator chose', !created.error && fs.existsSync(path.join(libraryDir, 'dreamcut-library.json')));
  const open = await call('editor_open', {});
  let url;
  try { url = JSON.parse(open.text).url; } catch { url = undefined; }
  if (!url) { check('editor_open returns a single-use link', false, open.text.slice(0, 200)); throw new Error('No editor link; later checks need it.'); }
  check('editor_open returns a single-use link', /\/__dreamcut\/session\?code=/.test(url ?? ''));
  const origin = new URL(url).origin;
  check('the editor listens only on loopback', new URL(url).hostname === '127.0.0.1');
  check('requests without signing in are refused', (await fetch(`${origin}/`)).status === 403);
  const signIn = await fetch(url, { redirect: 'manual' });
  const cookie = signIn.headers.get('set-cookie')?.split(';')[0];
  check('the link signs a browser in', signIn.status === 303 && !!cookie);
  const home = await fetch(`${origin}/`, { headers: { Cookie: cookie } });
  check('the production editor serves its home page', home.status === 200 && (await home.text()).includes('DreamCut'));
  check('the same link cannot be reused', (await fetch(url, { redirect: 'manual' })).status === 403);

  // Publish a newer version while the editor runs: the same app layer with a higher version, same base.
  const nextVersion = feed.version.replace(/^(\d+)\.(\d+)\.(\d+)/, (_, major, minor, patch) => `${major}.${minor}.${Number(patch) + 1}`);
  const nextFolder = `dreamcut-app-${key}-${nextVersion}`;
  const staging = path.join(temp, 'next build');
  fs.mkdirSync(staging);
  execFileSync('tar', ['-xzf', path.join(dist, 'web-runtime', feed.platforms[key].app.file), '-C', staging]);
  fs.renameSync(path.join(staging, feed.platforms[key].app.folder), path.join(staging, nextFolder));
  for (const file of ['package.json', 'dreamcut-app.json']) {
    const target = path.join(staging, nextFolder, file);
    fs.writeFileSync(target, JSON.stringify({ ...JSON.parse(fs.readFileSync(target, 'utf8')), version: nextVersion }, null, 2));
  }
  const nextArchive = path.join(updates, `${nextFolder}.tar.gz`);
  execFileSync('tar', ['-czf', nextArchive, '-C', staging, nextFolder]);
  const bytes = fs.readFileSync(nextArchive);
  feed = { ...feed, version: nextVersion, platforms: { ...feed.platforms, [key]: { ...feed.platforms[key], app: {
    file: path.basename(nextArchive), sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, folder: nextFolder } } } };
  const latestFile = path.join(runtimes, 'latest-installed.json');
  const readLatest = () => { try { return JSON.parse(fs.readFileSync(latestFile, 'utf8')).version; } catch { return null; } };
  started = Date.now();
  while (readLatest() !== nextVersion && Date.now() - started < 180_000) await new Promise(resolve => setTimeout(resolve, 500));
  check('a newer version is installed in the background while the editor runs', readLatest() === nextVersion, `${Math.round((Date.now() - started) / 1000)} s`);
  check('the update does not download the base layer again', downloads.get(feed.platforms[key].base.file) === 1);
  const authed = { Cookie: cookie, Origin: origin };
  const offered = await fetch(`${origin}/__dreamcut/update`, { headers: authed }).then(r => r.json(), () => null);
  check('the running editor offers the update', offered?.available === nextVersion, JSON.stringify(offered));
  check('the update endpoint requires the session', (await fetch(`${origin}/__dreamcut/update`, { method: 'POST' })).status === 403);
  const applied = await fetch(`${origin}/__dreamcut/update`, { method: 'POST', headers: authed });
  check('applying the update is accepted', applied.status === 202);
  started = Date.now();
  let health = null;
  while (Date.now() - started < 90_000) {
    await new Promise(resolve => setTimeout(resolve, 500));
    health = await fetch(`${origin}/__dreamcut/health`, { headers: { Cookie: cookie } }).then(r => (r.ok ? r.json() : null), () => null);
    if (health?.version === nextVersion) break;
  }
  check('the editor restarts as the new version on the same address, still signed in', health?.version === nextVersion
    && path.basename(health.root) === `${nextVersion}-${key}`, `${Math.round((Date.now() - started) / 1000)} s`);
  check('the agent keeps working after the update', !(await call('library_status', {})).error);

  const runtimeFile = path.join(temp, 'app data', 'runtime', 'editor.json');
  check('the running editor is recorded for other callers', fs.existsSync(runtimeFile) && (fs.statSync(runtimeFile).mode & 0o777) === 0o600);
  check('no project data was written inside the runtime install', !fs.readdirSync(path.join(runtimes, 'app')).some(dir => fs.existsSync(path.join(runtimes, 'app', dir, 'projects'))));
  const editorPid = JSON.parse(fs.readFileSync(runtimeFile, 'utf8')).pid;
  mcp.stdin.end(); mcp.kill('SIGTERM');
  await new Promise(resolve => mcp.once('exit', resolve));
  const alive = () => { try { process.kill(editorPid, 0); return true; } catch { return false; } };
  for (let waited = 0; alive() && waited < 15000; waited += 250) await new Promise(resolve => setTimeout(resolve, 250));
  check('closing the agent stops the editor process', !alive());
  check('closing the agent removes the running-editor record', !fs.existsSync(runtimeFile));
  if (results.some(result => !result.ok)) console.log(`\nMCP stderr (last 1500 chars):\n${stderr.slice(-1500)}`);
} finally {
  server.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
const failed = results.filter(result => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
