/**
 * DreamCut's entry in the Claude desktop extension (.mcpb). Claude starts Node extensions on the Node built
 * into its app, where `process.execPath` is Claude's helper, not a Node that can start DreamCut's processes.
 * So this runs the npm launcher (../launcher) on a real Node: the one Claude used if it is a standalone
 * Node 22+, else the launcher's pinned private Node (../launcher/lib/private-node.mjs, downloaded once).
 * While that downloads, Claude gets an answer at once through the launcher's first-run bootstrap.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveWhileInstalling } from '../launcher/lib/mcp-bootstrap.mjs';
import { NODE_VERSION, installRuntimeNode, readyRuntimeNode } from '../launcher/lib/private-node.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const launcher = path.join(here, '..', 'launcher', 'bin', 'dreamcut.mjs');
const version = JSON.parse(fs.readFileSync(path.join(here, '..', 'launcher', 'runtime-manifest.json'), 'utf8')).version ?? '0';
const say = message => process.stderr.write(`DreamCut extension: ${message}\n`);

function appDataRoot(env = process.env) {
  if (env.DREAMCUT_APP_DATA_DIR?.trim()) return path.resolve(env.DREAMCUT_APP_DATA_DIR.trim());
  const home = os.homedir();
  const base = process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support')
    : process.platform === 'win32' ? env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local')
      : env.XDG_DATA_HOME ?? path.join(home, '.local', 'share');
  return path.join(base, 'DreamCut');
}

/** Claude ran this file on a standalone Node 22+ (not its own built-in one): the launcher can run on it. */
const launchingNode = () => !process.versions.electron && Number(process.versions.node.split('.')[0]) >= 22 ? process.execPath : null;

/** The npm launcher's MCP server; it fetches the editor on first use and starts it when a tool needs it. */
function start(node) {
  say(`starting the DreamCut launcher on ${node}`);
  return spawn(node, [launcher, 'mcp'], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, PATH: [path.dirname(node), process.env.PATH, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].filter(Boolean).join(path.delimiter) },
  });
}

const ready = launchingNode() ?? readyRuntimeNode(appDataRoot());
if (ready) {
  const child = start(ready);
  process.stdin.pipe(child.stdin);
  child.stdout.pipe(process.stdout);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
} else {
  say(`no usable Node.js yet (running on ${process.execPath}, Node ${process.versions.node}); downloading ${NODE_VERSION}`);
  const progress = { done: 0, total: 0 };
  const session = serveWhileInstalling({
    version,
    status: () => `DreamCut is downloading Node.js, which it runs on (${progress.total ? Math.min(99, Math.floor((progress.done / progress.total) * 100)) : 0}% of about 50 MB). Next it downloads the editor itself.`,
    install: () => installRuntimeNode(appDataRoot(), progress),
    start,
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (session.child) session.child.kill(signal); else process.exit(0); });
  process.exit(await session.exited);
}
