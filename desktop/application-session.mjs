import { app, BrowserWindow, session, shell, utilityProcess, ipcMain, systemPreferences } from 'electron';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SESSION_COOKIE, isApplicationUrl, isExternalWebUrl } from './service-policy.mjs';
import { waitForDesktopService } from './service-startup.mjs';
import { guardServiceWorkers } from './service-worker-guard.mjs';
import { stopDesktopService } from './service-shutdown.mjs';
import { installChatIpc } from './chat-ipc.mjs';
import { readEnv } from '../mcp/env-name.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
import { installDictationIpc } from './dictation-ipc.mjs';
const registerDictation = installDictationIpc(ipcMain, {requestMicrophone: async()=>process.platform!=='darwin' || await systemPreferences.askForMediaAccess('microphone')});
const registerChat = installChatIpc(ipcMain);
// Startup discovery is a hint for the picker; connecting reports the current state.
export function agentProviders(env) {
  return {
    codex: readEnv("CODEX_EXECUTABLE", env) ? { executable: readEnv("CODEX_EXECUTABLE", env) } : undefined,
    claude: readEnv("CLAUDE_STATE", env) === 'available'
      ? { executable: readEnv("CLAUDE_EXECUTABLE", env) || undefined, authentication: readEnv("CLAUDE_AUTHENTICATION", env) || 'unknown' } : undefined,
    local: readEnv("LOCAL_STATE", env) === 'available' && readEnv("LOCAL_MODELS", env)
      ? { executable: readEnv("LOCAL_EXECUTABLE", env), authentication: 'signed-in', models: readEnv("LOCAL_MODELS", env).split(','),
        defaultModel: readEnv("LOCAL_DEFAULT_MODEL", env) || undefined } : undefined,
  };
}

// One service and browser partition per project root. Windows never share an
// authentication cookie across loopback ports (cookies are not port-scoped).
export function createApplicationSession({ root, env, onFailure, onExit }) {
  const token = randomBytes(32).toString('hex');
  const partition = `dreamcut-${randomBytes(12).toString('hex')}`;
  const service = utilityProcess.fork(path.join(here, 'service.mjs'), [], {
    cwd: root, serviceName: 'DreamCut application service', stdio: 'pipe',
    env: { ...env, DREAMCUT_SERVICE_ROOT: root, DREAMCUT_SERVICE_TOKEN: token,
      DREAMCUT_SERVICE_DEV: app.isPackaged ? '0' : '1',
      TIMELINE_NEXT_DIST_DIR: app.isPackaged ? '.next-desktop' : '.next-desktop-dev' },
  });
  guardServiceWorkers(service, { onFailure });
  service.stdout?.on('data', chunk => process.stdout.write(chunk));
  service.stderr?.on('data', chunk => process.stderr.write(chunk));
  let window, disposeChat, dictation;
  let expectedExit = false;
  let dead = false;
  service.once('exit', () => {
    dead = true;
    window?.destroy();
    if (!expectedExit) onExit();
  });
  const ready = (async () => {
    try {
    const origin = await waitForDesktopService(service);
    const browserSession = session.fromPartition(partition);
    browserSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(Boolean(
      contents === window?.webContents && permission === 'media' && details.isMainFrame &&
      isApplicationUrl(details.requestingUrl, origin) && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio' && dictation?.canRecord())));
    browserSession.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => Boolean(
      contents === window?.webContents && permission === 'media' && isApplicationUrl(requestingOrigin, origin) && details.mediaType === 'audio' && dictation?.canRecord()));
    await browserSession.cookies.set({ url: origin, name: SESSION_COOKIE, value: token, httpOnly: true, sameSite: 'strict', path: '/' });
    return origin;
    } catch (error) {
      expectedExit = true;
      await stopDesktopService(service);
      throw error;
    }
  })();
    return {
      get window() { return window; },
      async show(projectId) {
        const origin = await ready;
        if (dead) throw Error('The local editor service stopped. Open the project again to reconnect.');
        if (!window) {
          window = new BrowserWindow({ width: 1440, height: 940, minWidth: 900, minHeight: 640, title: 'DreamCut', show: false,
            ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 13 } } : {}),
            webPreferences: { preload: path.join(here, 'preload.cjs'), partition, contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
          dictation = registerDictation(window, {origin, directory: app.isPackaged ? path.join(process.resourcesPath,'voice') : path.join(root,'.desktop-build','voice')});
          const codexEnv = Object.fromEntries(['HOME', 'PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'PATHEXT', 'COMSPEC'].filter(key => env[key]).map(key => [key, env[key]]));
          disposeChat = registerChat(window, { origin, projectsRoot: env.TIMELINE_PROJECTS_DIR,
            userData: app.getPath('userData'), agents: agentProviders(env),
            env: codexEnv, serviceToken: token, harnessRoot: root });
          window.webContents.on('render-process-gone', onFailure);
          window.on('closed', () => { window = undefined; });
          window.webContents.on('will-attach-webview', event => event.preventDefault());
          window.webContents.on('will-navigate', (event, url) => { if (!isApplicationUrl(url, origin)) event.preventDefault(); });
          window.webContents.setWindowOpenHandler(({ url }) => {
            if (isExternalWebUrl(url) && !isApplicationUrl(url, origin)) void shell.openExternal(url);
            return { action: 'deny' };
          });
          window.once('ready-to-show', () => window?.show());
        }
        const url = projectId ? `${origin}/p/${encodeURIComponent(projectId)}` : origin;
        if (window.webContents.getURL() !== url) await window.loadURL(url);
        if (window.isMinimized()) window.restore();
        window.show(); window.focus();
      },
      async stop() { expectedExit = true; dictation?.cancel(); try { await disposeChat?.(); } finally { await stopDesktopService(service); } },
    };
}
