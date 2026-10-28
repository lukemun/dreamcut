#!/usr/bin/env node
/**
 * dreamcut — run the DreamCut editor locally and connect coding agents to it.
 *
 *   dreamcut            start (or reuse) the editor and open it in your browser
 *   dreamcut mcp        the DreamCut MCP server for Claude Code / Codex (starts the editor on first use)
 *   dreamcut status     show whether an editor is running
 *   dreamcut update     update a DreamCut installed with git clone to GitHub's latest version
 *   dreamcut setup           install everything the features use now (about 4 GB; runs in the background by itself)
 *   dreamcut setup-matting   install subject tracing for cutout templates (about 1 GB)
 *   dreamcut setup-voice     install voice enhancement for "Enhance voice" (about 400 MB)
 *   dreamcut setup-speech    install the caption models (Whisper; MFA's when MFA is installed)
 *   dreamcut doctor          check every program and model DreamCut uses
 *   dreamcut --help     show this usage
 *
 * The editor listens only on 127.0.0.1 and requires a per-launch session; browsers sign in with a
 * single-use link. Projects live in your DreamCut Library; nothing is uploaded. Run from Claude Code or
 * Codex, it never opens the system browser: the agent opens the link in its own built-in browser.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EDITOR_ROOT, agentHost, ensureEditor, isPackagedRuntime, runningEditor, runtimeEnvDefaults, signInUrl } from '../mcp/editor-runtime.mjs';
import { applyUpdate, checkForUpdates, describeUpdate } from '../mcp/install-updates.mjs';
import { UPDATE_PATH } from '../mcp/runtime-updates.mjs';
import { startFeatureSetup } from '../scripts/setup-features.mjs';

const USAGE = `Usage:
  dreamcut [--no-open]    start (or reuse) the editor and open it in your browser
  dreamcut mcp            the DreamCut MCP server for Claude Code / Codex
  dreamcut status         show whether an editor is running
  dreamcut update         update this copy to GitHub's latest version (git installs only; never discards changes)
  dreamcut setup          install everything the features use now (about 4 GB; runs in the background by itself)
  dreamcut setup-matting  install subject tracing for cutout templates (about 1 GB)
  dreamcut setup-voice    install voice enhancement for "Enhance voice" (about 400 MB)
  dreamcut setup-speech   install the caption models (Whisper; MFA's when MFA is installed)
  dreamcut doctor         check every program and model DreamCut uses
  dreamcut --help         show this usage`;

// A leading flag (`dreamcut --no-open`) belongs to the default command.
const argv = process.argv.slice(2);
if (argv.some(argument => argument === '--help' || argument === '-h') || argv[0] === 'help') {
  console.log(USAGE);
  process.exit(0);
}
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
// An installed DreamCut sets up the programs and models its features use in the background (about 4 GB, once);
// the editor works meanwhile, and each feature becomes available as its step finishes.
if ((command === 'mcp' || command === 'open') && isPackagedRuntime()) {
  try { startFeatureSetup(); } catch (error) { console.error(`DreamCut could not start setting up its features: ${error.message}`); }
}
if (command === 'mcp') {
  process.env.DREAMCUT_EDITOR_AUTOSTART = '1';
  // Exit normally on a signal so the editor this process owns is recorded as stopped.
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => process.exit(0));
  await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'mcp', 'server.mjs')).href);
} else if (command === 'setup-matting') {
  // Subject tracing for cutout templates (about 1 GB), into DreamCut's app data.
  // From EDITOR_ROOT: in a checkout the default `.matting` is relative, and the editor reads it there.
  const child = spawn(process.execPath, [path.join(EDITOR_ROOT, 'scripts', 'setup-matting.mjs')], { stdio: 'inherit', env: process.env, cwd: EDITOR_ROOT });
  child.on('exit', code => process.exit(code ?? 1));
} else if (['setup', 'setup-voice', 'setup-speech', 'doctor'].includes(command)) {
  // setup-voice: DeepFilterNet (about 400 MB), also repairing an install whose folder was renamed.
  // setup-speech: the checksum-verified caption models. doctor: reports what is missing and how to add it.
  const script = command === 'setup' ? 'setup-features' : command;
  const child = spawn(process.execPath, [path.join(EDITOR_ROOT, 'scripts', `${script}.mjs`), ...rest], { stdio: 'inherit', env: process.env });
  child.on('exit', code => process.exit(code ?? 1));
} else if (command === 'update') {
  console.error('Checking GitHub for DreamCut updates…');
  const result = await applyUpdate({ root: EDITOR_ROOT });
  if (!result.updated) {
    const said = { up_to_date: 'DreamCut is up to date.', updates_off: `This copy does not update itself (${result.reason}).` }[result.status];
    console.log(said ?? result.reason);
    process.exit(result.status === 'up_to_date' || result.status === 'updates_off' ? 0 : 1);
  }
  console.log(`DreamCut is updated (${result.behind} change${result.behind === 1 ? '' : 's'}${result.dependencies_installed ? ', dependencies reinstalled' : ''}):`);
  for (const change of result.changes.slice(0, 10)) console.log(`  - ${change}`);
  // A running editor restarts in place from the new code; open pages stay signed in.
  const running = await runningEditor();
  if (running) {
    const restart = await fetch(`${running.origin}${UPDATE_PATH}`, { method: 'POST', headers: { Cookie: `dreamcut_desktop_session=${running.token}` }, signal: AbortSignal.timeout(5000) }).catch(() => null);
    console.log(restart?.status === 202 ? 'The running editor is restarting with the new version.'
      : 'The running editor keeps the previous version until it restarts (its Update button, or stop and start DreamCut).');
  } else console.log('A running `pnpm editor` switches to the new version by itself within a few minutes.');
  console.log('Start a new chat so your agent uses the updated DreamCut tools.');
} else if (command === 'status') {
  const running = await runningEditor();
  console.log(running ? `DreamCut is running at ${running.origin} (pid ${running.pid}).` : 'DreamCut is not running.');
} else if (command === 'open') {
  const unknown = [...flags].filter(flag => flag !== '--no-open');
  if (unknown.length) {
    console.error(`Unknown option ${unknown[0]}.\n${USAGE}`);
    process.exit(2);
  }
  console.error('Starting DreamCut…');
  // Checked beside the start, never before it: offline costs nothing, and the notice comes with the link.
  const updates = checkForUpdates({ root: EDITOR_ROOT }).catch(() => null);
  const editor = await ensureEditor({ root: EDITOR_ROOT });
  const notice = describeUpdate(await Promise.race([updates, new Promise(resolve => setTimeout(resolve, 3000, null))]));
  if (notice) console.log(`${notice}\n`);
  const { url } = await signInUrl(editor, '/');
  const host = agentHost();
  if (host) console.log(`DreamCut is ready. Open this single-use link in ${host}'s built-in browser (it was not opened in your system browser):\n${url}`);
  else console.log(`DreamCut is ready. Open this single-use link in your browser:\n${url}`);
  if (!host && !flags.has('--no-open')) openInBrowser(url);
  if (editor.owned) {
    console.log('Keep this window open while you edit. Press Ctrl+C to stop DreamCut.');
    process.on('SIGINT', editor.stop);
    process.on('SIGTERM', editor.stop);
    // An update restarts the editor in place; this command ends only when the editor finally stops.
    editor.stopped.then(code => process.exit(code ?? 0));
  }
} else {
  console.error(`Unknown command "${command}".\n${USAGE}`);
  process.exit(2);
}
