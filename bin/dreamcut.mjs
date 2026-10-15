#!/usr/bin/env node
/**
 * dreamcut — run the DreamCut editor locally and connect coding agents to it.
 *
 *   dreamcut            start (or reuse) the editor and open it in your browser
 *   dreamcut mcp        the DreamCut MCP server for Claude Code / Codex (starts the editor on first use)
 *   dreamcut status     show whether an editor is running
 *
 * The editor listens only on 127.0.0.1 and requires a per-launch session; browsers sign in with a
 * single-use link. Projects live in your DreamCut Library; nothing is uploaded.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EDITOR_ROOT, ensureEditor, runningEditor, runtimeEnvDefaults, signInUrl } from '../mcp/editor-runtime.mjs';

// A leading flag (`dreamcut --no-open`) belongs to the default command.
const argv = process.argv.slice(2);
const [command, ...rest] = argv[0]?.startsWith('-') || !argv.length ? ['open', ...argv] : argv;
const flags = new Set(rest);

function openInBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    // No shell: cmd.exe would treat the link's "&" as a command separator.
    : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

Object.assign(process.env, runtimeEnvDefaults());
if (command === 'mcp') {
  process.env.DREAMCUT_EDITOR_AUTOSTART = '1';
  // Exit normally on a signal so the editor this process owns is recorded as stopped.
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => process.exit(0));
  await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'mcp', 'server.mjs')).href);
} else if (command === 'status') {
  const running = await runningEditor();
  console.log(running ? `DreamCut is running at ${running.origin} (pid ${running.pid}).` : 'DreamCut is not running.');
} else if (command === 'open') {
  console.error('Starting DreamCut…');
  const editor = await ensureEditor({ root: EDITOR_ROOT });
  const { url } = await signInUrl(editor, '/');
  console.log(`DreamCut is ready. Open this single-use link in your browser:\n${url}`);
  if (!flags.has('--no-open')) openInBrowser(url);
  if (editor.owned) {
    console.log('Keep this window open while you edit. Press Ctrl+C to stop DreamCut.');
    process.on('SIGINT', editor.stop);
    process.on('SIGTERM', editor.stop);
    // An update restarts the editor in place; this command ends only when the editor finally stops.
    editor.stopped.then(code => process.exit(code ?? 0));
  }
} else {
  console.error(`Unknown command "${command}". Use: dreamcut, dreamcut mcp, or dreamcut status.`);
  process.exit(2);
}
