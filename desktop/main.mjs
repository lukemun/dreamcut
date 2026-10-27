import { app, autoUpdater, BrowserWindow, dialog, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createUpdateController, updateFeed } from './updates.mjs';
import { fileURLToPath } from 'node:url';
import { initializeDesktopTelemetry, reportDesktopFailure, flushDesktopTelemetry } from './telemetry.mjs';
import { desktopDataEnvironment } from './data-paths.mjs';
import { discoverCodex } from './codex-discovery.mjs';
import { discoverClaude } from './claude-discovery.mjs';
import { discoverLocal } from './local-discovery.mjs';
import { stopLocalModel } from './local-session.mjs';
import { desktopRuntimeEnvironment } from './runtime-environment.mjs';
import { createApplicationSession } from './application-session.mjs';
import { inspectProjectFolder, rememberProject, rememberedProject } from './project-opening.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
app.setName('DreamCut');
if (process.env.DREAMCUT_DESKTOP_USER_DATA) app.setPath('userData', path.resolve(process.env.DREAMCUT_DESKTOP_USER_DATA));
initializeDesktopTelemetry(process.env, `dreamcut@${app.getVersion()}`);
const sessions = new Map();
let runtimeEnv, root, defaultProjectsRoot;
let quitting = false, quitAllowed = false, opening = false, choosing = false, shutdown;
let pendingProject, updates;
let updateDialogOpen = false, pendingUpdateState;
app.on('open-file', (event, file) => { event.preventDefault(); pendingProject = file; if (runtimeEnv) void openPendingProject(); });
if (!app.requestSingleInstanceLock()) app.exit(0);
else void start();

async function openTarget(target) {
  if (quitting) return;
  const projectsRoot = target?.projectsRoot ?? defaultProjectsRoot;
  let context = sessions.get(projectsRoot);
  if (!context) {
    context = createApplicationSession({ root, env: { ...runtimeEnv, TIMELINE_PROJECTS_DIR: projectsRoot },
      onFailure: () => reportDesktopFailure('renderer-exit'),
      onExit: () => {
        sessions.delete(projectsRoot);
        if (!quitting) {
          reportDesktopFailure('service-exit');
          dialog.showErrorBox('DreamCut stopped', 'The local editor service stopped. Open the project again to reconnect. Your saved projects are retained.');
        }
      },
    });
    sessions.set(projectsRoot, context);
  }
  try { await context.show(target?.projectId); }
  catch (error) { sessions.delete(projectsRoot); await context.stop(); throw error; }
  if (target) await rememberProject(app.getPath('userData'), target).catch(() => reportDesktopFailure('startup'));
}
async function openPendingProject() {
  if (opening || quitting || !pendingProject) return;
  opening = true;
  const input = pendingProject; pendingProject = undefined;
  try { await openTarget(await inspectProjectFolder(input)); }
  catch (error) { if (!quitting) dialog.showErrorBox('Could not open project', error.message); }
  finally { opening = false; if (pendingProject) void openPendingProject(); }
}
async function chooseProject() {
  if (opening || choosing || quitting) return;
  choosing = true;
  try {
  const options = { title: 'Open DreamCut project', message: 'Choose the project folder containing timeline.json.', buttonLabel: 'Open Project', properties: ['openDirectory'] };
  const focused = BrowserWindow.getFocusedWindow();
  const result = focused ? await dialog.showOpenDialog(focused, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return;
  pendingProject = result.filePaths[0];
  await openPendingProject();
  } finally { choosing = false; }
}
async function stopOwnedSessions() {
  shutdown ??= Promise.allSettled([...sessions.entries()].map(async ([key, context]) => {
    await context.stop();
    if (sessions.get(key) === context) sessions.delete(key);
  })).then(async results => {
    // The shared local model server outlives windows; it stops with the app.
    await stopLocalModel().catch(() => {});
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    await flushDesktopTelemetry();
  });
  return shutdown;
}
async function showUpdateStatus(state) {
  if (quitting) return;
  if (updateDialogOpen) { pendingUpdateState = state; return; }
  const messages = {
    unavailable: 'Updates are not available for this local build.',
    checking: 'DreamCut is checking for updates.', downloading: 'An update is downloading.',
    current: 'DreamCut is up to date.', failed: 'The update could not be completed. You can try again from the DreamCut menu.',
    ready: 'An update is ready. Restart now to install it, or it will install the next time DreamCut starts.',
  };
  if (!messages[state]) return;
  updateDialogOpen = true;
  try {
    const result = await dialog.showMessageBox({ type: state === 'failed' ? 'warning' : 'info', title: 'DreamCut updates', message: messages[state],
      buttons: state === 'ready' ? ['Later', 'Restart Now'] : ['OK'], defaultId: 0, cancelId: 0 });
    if (state === 'ready' && result.response === 1) await updates.install();
  } finally {
    updateDialogOpen = false;
    if (pendingUpdateState) {
      const pending = pendingUpdateState; pendingUpdateState = undefined;
      void showUpdateStatus(pending).catch(() => {});
    }
  }
}
async function checkForUpdates() {
  if (quitting || updateDialogOpen) return;
  if (!['idle', 'current', 'failed'].includes(updates.state)) return showUpdateStatus(updates.state);
  updateDialogOpen = true;
  let result;
  try { result = await dialog.showMessageBox({ type: 'info', title: 'DreamCut updates',
    message: 'Check for updates? If a newer version is available, it will download and install the next time DreamCut starts.',
    buttons: ['Cancel', 'Check & Download'], defaultId: 1, cancelId: 0 }); }
  finally { updateDialogOpen = false; }
  if (result.response === 1) await updates.check();
}
async function configureUpdates() {
  let feed = null;
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(here, 'release.json'), 'utf8'));
    feed = updateFeed(manifest, { packaged: app.isPackaged, platform: process.platform, arch: process.arch, version: app.getVersion() });
  } catch { /* Invalid or absent metadata never enables a destination. */ }
  updates = createUpdateController({ updater: autoUpdater, feed,
    verifySignature: async () => {
      const bundle = path.resolve(process.execPath, '../../..');
      await promisify(execFile)('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { timeout: 30000 });
      const signature = await promisify(execFile)('/usr/bin/codesign', ['--display', '--verbose=2', bundle], { timeout: 10000 });
      if (!signature.stderr.includes('Authority=Developer ID Application:')) throw Error('Release signature required.');
    },
    prepareToInstall: async () => {
      quitting = true;
      try { await stopOwnedSessions(); quitAllowed = true; }
      catch (error) { quitting = false; shutdown = undefined; throw error; }
    },
    onInstallFailure: () => {
      quitting = false; quitAllowed = false; shutdown = undefined;
    },
    onState: state => {
      if (['current', 'failed', 'ready'].includes(state)) void showUpdateStatus(state).catch(() => {});
    },
  });
  app.on('will-quit', () => updates.dispose());
}
async function start() {
  app.on('second-instance', (_event, argv) => {
    const index = argv.indexOf('--project');
    if (index >= 0 && argv[index + 1]) { pendingProject = argv[index + 1]; if (runtimeEnv) void openPendingProject(); }
    else { const window = BrowserWindow.getAllWindows()[0]; if (window?.isMinimized()) window.restore(); window?.focus(); }
  });
  app.on('before-quit', event => {
    if (quitAllowed) return;
    event.preventDefault(); quitting = true;
    void stopOwnedSessions().catch(() => {
      // Reporting must not prevent finishing Quit.
    }).finally(() => { quitAllowed = true; app.quit(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (runtimeEnv && !opening && !BrowserWindow.getAllWindows().length) void openTarget().catch(error => dialog.showErrorBox('Could not open DreamCut', error.message)); });
  await app.whenReady();
  try {
    root = app.isPackaged ? path.join(process.resourcesPath, 'service') : path.resolve(here, '..');
    const env = desktopRuntimeEnvironment(process.env, app.isPackaged ? { mediaToolsDirectory: path.join(process.resourcesPath, 'media-tools', 'bin') } : {});
    const [codex, claude, local] = await Promise.all([discoverCodex({ env }), discoverClaude({ env }), discoverLocal({ env, harnessRoot: root }).catch(() => ({ state: 'unavailable', models: [] }))]);
    runtimeEnv = { ...env, ...(codex.state === 'available' ? { DREAMCUT_CODEX_EXECUTABLE: codex.executable } : {}),
      ...(local.state === 'available' ? { DREAMCUT_LOCAL_STATE: 'available', DREAMCUT_LOCAL_EXECUTABLE: local.executable, DREAMCUT_LOCAL_MODELS: local.models.join(',') } : {}),
      ...(claude.executable ? { DREAMCUT_CLAUDE_EXECUTABLE: claude.executable } : {}), DREAMCUT_CLAUDE_STATE: claude.state, DREAMCUT_CLAUDE_AUTHENTICATION: claude.authentication,
      ...(app.isPackaged ? desktopDataEnvironment(process.env, app.getPath('userData')) : {}) };
    defaultProjectsRoot = path.resolve(runtimeEnv.TIMELINE_PROJECTS_DIR || path.join(root, 'projects'));
    await configureUpdates();
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'DreamCut', submenu: [{ role: 'about' }, { label: 'Check for Updates…', click: () => void checkForUpdates().catch(() => {}) }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      { label: 'File', submenu: [{ label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => void chooseProject() }, { type: 'separator' }, { role: 'close' }] },
      { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    ]));
    const index = process.argv.indexOf('--project');
    pendingProject ??= index >= 0 ? process.argv[index + 1] : undefined;
    if (pendingProject) await openPendingProject();
    else await openTarget(await rememberedProject(app.getPath('userData')));
  } catch (error) {
    reportDesktopFailure('startup');
    if (!quitting) dialog.showErrorBox('DreamCut could not start', error.message);
    app.quit();
  }
}
