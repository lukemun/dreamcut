import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * The Node every DreamCut runtime runs on. Release builds compile native modules (better-sqlite3, sharp) for
 * Node 24 (ABI 137), so the launcher, which itself runs on any Node 22+, starts the runtime on this pinned
 * Node unless it already is a Node 24. Downloaded once into DreamCut's app data, checksum-verified, and
 * shared with the ChatGPT installer (packaging/chatgpt-installer/install.sh) and the Claude extension.
 */
export const NODE_VERSION = 'v24.19.0';
const RUNTIME_ABI = '137';
// Checksums from https://nodejs.org/dist/v24.19.0/SHASUMS256.txt.
const BUILDS = {
  'darwin-arm64': { name: 'node-v24.19.0-darwin-arm64', archive: 'tar.gz', sha256: '8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d' },
  'darwin-x64': { name: 'node-v24.19.0-darwin-x64', archive: 'tar.gz', sha256: 'd1b5e999db158c62fe8f7267a4476b035d8bd93b1a605bac24a3f0dd166e3316' },
  'win32-x64': { name: 'node-v24.19.0-win-x64', archive: 'zip', sha256: '57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73' },
  'win32-arm64': { name: 'node-v24.19.0-win-arm64', archive: 'zip', sha256: '8502f4a50b458d4cc38ed8f2001556c2cd239d464920f74017926ccb1e1c157f' },
};

export function privateNode(appData) {
  const build = BUILDS[`${process.platform}-${process.arch}`];
  if (!build) return null;
  const root = path.join(appData, 'plugin-runtime');
  // Windows builds keep node.exe at the top of the folder; macOS builds keep node in bin/.
  const binary = process.platform === 'win32' ? path.join(root, build.name, 'node.exe') : path.join(root, build.name, 'bin', 'node');
  return { build, root, binary };
}

/** This process can run the runtime itself: a standalone Node with the runtime's ABI (not Electron's). */
export const canRunRuntime = () => !process.versions.electron && process.versions.modules === RUNTIME_ABI;

/** A Node that can run the runtime now, without downloading: this one, or the private copy. */
export function readyRuntimeNode(appData) {
  if (canRunRuntime()) return process.execPath;
  const target = privateNode(appData);
  if (!target) return null;
  try { return execFileSync(target.binary, ['--version'], { encoding: 'utf8', timeout: 10_000 }).trim() === NODE_VERSION ? target.binary : null; }
  catch { return null; }
}

/** Download and verify the private Node (about 50 MB, once). `progress` receives { done, total }. */
export async function installRuntimeNode(appData, progress = { done: 0, total: 0 }) {
  const ready = readyRuntimeNode(appData);
  if (ready) return ready;
  const target = privateNode(appData);
  if (!target) {
    throw Object.assign(new Error(`no Node download for ${process.platform}-${process.arch}`), {
      guidance: 'DreamCut needs Node.js 24 on this computer. Install it from https://nodejs.org, then try again.',
    });
  }
  const { build, root } = target;
  fs.mkdirSync(root, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(root, '.node-download-'));
  try {
    const archive = path.join(scratch, `node.${build.archive}`);
    const response = await fetch(`https://nodejs.org/dist/${NODE_VERSION}/${build.name}.${build.archive}`);
    if (!response.ok || !response.body) throw new Error(`Node.js download failed (HTTP ${response.status})`);
    progress.total = Number(response.headers.get('content-length')) || 0;
    const hash = createHash('sha256');
    const body = Readable.fromWeb(response.body);
    body.on('data', chunk => { hash.update(chunk); progress.done += chunk.length; });
    await pipeline(body, fs.createWriteStream(archive));
    if (hash.digest('hex') !== build.sha256) throw new Error('the Node.js download did not match its checksum');
    // macOS and Windows 10+ both ship a bsdtar that unpacks .tar.gz and .zip.
    const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : '/usr/bin/tar';
    execFileSync(tar, ['-xf', archive, '-C', scratch]);
    // Another process may have finished first; keep whichever complete copy is in place.
    if (!readyRuntimeNode(appData)) {
      fs.rmSync(path.join(root, build.name), { recursive: true, force: true });
      fs.renameSync(path.join(scratch, build.name), path.join(root, build.name));
    }
    const node = readyRuntimeNode(appData);
    if (!node) throw new Error('the downloaded Node.js could not start');
    return node;
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}
