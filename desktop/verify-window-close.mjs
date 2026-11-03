import { app, BrowserWindow, ipcMain } from 'electron';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Native lifetime regression: Electron destroys webContents before `closed`.
// No project, microphone, model connection or user data is used.
app.on('window-all-closed', () => {});
const failures = [];
setTimeout(() => { console.error('Window lifecycle timed out', failures.map(error => error.stack)); app.exit(1); }, 10000).unref();
process.on('uncaughtException', error => { failures.push(error); });
process.on('unhandledRejection', error => { failures.push(error); });
void app.whenReady().then(async () => {
const shell = process.argv[2];
const { installChatIpc } = await import(shell ? pathToFileURL(path.join(shell, 'chat-ipc.mjs')).href : './chat-ipc.mjs');
const { installDictationIpc } = await import(shell ? pathToFileURL(path.join(shell, 'dictation-ipc.mjs')).href : './dictation-ipc.mjs');
const registerChat = installChatIpc(ipcMain);
const registerVoice = installDictationIpc(ipcMain);
try {
  for (let index = 0; index < 3; index++) {
    const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    const dispose = registerChat(window, { origin: 'http://127.0.0.1:1' });
    registerVoice(window, { origin: 'http://127.0.0.1:1', directory: '/unused' });
    await window.loadURL('data:text/html,<title>DreamCut lifecycle test</title>');
    const closed = new Promise(resolve => window.once('closed', resolve));
    window.close();
    await closed;
    await new Promise(resolve => setImmediate(resolve));
    await dispose();
    assert.equal(window.isDestroyed(), true);
  }
  assert.deepEqual(failures.map(error => error.message), []);
  console.log('Native window close, repeated reopen/close and post-close cleanup passed.');
  app.exit(0);
} catch (error) {
  console.error(error.stack);
  app.exit(1);
}

});
