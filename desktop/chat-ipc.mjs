import { CHAT_ACTIONS, createChatController } from './chat-controller.mjs';
import { createAgentLogin } from './agent-login.mjs';
import { createAgentModels } from './agent-models.mjs';

export function projectFromWindowUrl(value, origin) {
  try {
    const url = new URL(value);
    if (url.origin !== origin) return null;
    const match = /^\/p\/([A-Za-z0-9._-]{1,128})\/?$/.exec(url.pathname);
    return match && !['.', '..'].includes(match[1]) ? match[1] : null;
  } catch { return null; }
}

// One handler per Electron host; only registered top-level app frames may call it.
export function installChatIpc(ipcMain, { createLogin = createAgentLogin, models = createAgentModels() } = {}) {
  const windows = new Map();
  let login;
  ipcMain.handle('dreamcut:chat', async (event, action, text) => {
    const owner = windows.get(event.sender.id);
    if (!owner || event.senderFrame !== event.sender.mainFrame) throw Error('Unrecognized editing window.');
    if (!CHAT_ACTIONS.includes(action)) throw Error('Unsupported chat action.');
    return owner.call(action, text);
  });
  // agents: host-discovered providers, e.g. { codex: { executable }, claude: { executable?, authentication } }.
  // `executable` alone keeps the original Codex-only registration working.
  return function register(window, { origin, projectsRoot, userData, executable, agents = { codex: executable ? { executable } : undefined }, env, serviceToken, harnessRoot,
    openEditing, resetEditing }) {
    const contents = window.webContents;
    const contentsId = contents.id;
    login ??= createLogin({ env });
    const controller = createChatController({ origin, projectsRoot, userData, agents, env, serviceToken, harnessRoot, openEditing, resetEditing, login, models,
      projectNow: () => contents.isDestroyed() ? null : projectFromWindowUrl(contents.getURL(), origin),
      deliver: event => { if (!contents.isDestroyed()) contents.send('dreamcut:chat-event', event); } });
    const navigation = () => controller.projectChanged();
    contents.on('did-navigate', navigation);
    contents.on('did-navigate-in-page', navigation);
    windows.set(contentsId, { call: controller.call });
    let disposal;
    const dispose = () => {
      if (disposal) return disposal;
      windows.delete(contentsId);
      contents.removeListener('did-navigate', navigation);
      contents.removeListener('did-navigate-in-page', navigation);
      disposal = controller.dispose();
      return disposal;
    };
    window.once('closed', () => { void dispose().catch(() => {}); });
    return dispose;
  };
}
