const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dreamcutDesktop', Object.freeze({
  platform: process.platform,
  voice: Object.freeze({
    status: () => ipcRenderer.invoke('dreamcut:dictation', 'status'),
    begin: () => ipcRenderer.invoke('dreamcut:dictation', 'begin'),
    transcribe: audio => ipcRenderer.invoke('dreamcut:dictation', 'transcribe', audio),
    preview: audio => ipcRenderer.invoke('dreamcut:dictation', 'preview', audio),
    cancel: () => ipcRenderer.invoke('dreamcut:dictation', 'cancel'),
  }),
  chat: Object.freeze({
    status: () => ipcRenderer.invoke('dreamcut:chat', 'status'),
    history: () => ipcRenderer.invoke('dreamcut:chat', 'history'),
    newConversation: provider => ipcRenderer.invoke('dreamcut:chat', 'new-conversation', { provider }),
    connect: (provider, model) => ipcRenderer.invoke('dreamcut:chat', 'connect', { provider, model }),
    send: (text, model, provider, display, attachments) => ipcRenderer.invoke('dreamcut:chat', 'send', { text, model, provider, display, attachments }),
    cancel: () => ipcRenderer.invoke('dreamcut:chat', 'cancel'),
    disconnect: () => ipcRenderer.invoke('dreamcut:chat', 'disconnect'),
    models: provider => ipcRenderer.invoke('dreamcut:chat', 'models', { provider }),
    prewarm: (provider, model) => ipcRenderer.invoke('dreamcut:chat', 'prewarm', { provider, model }),
    login: (step, code) => ipcRenderer.invoke('dreamcut:chat', 'login', { provider: 'claude', step, code }),
    subscribe: listener => {
      if (typeof listener !== 'function') throw Error('A chat listener is required.');
      const receive = (_event, value) => listener(value);
      ipcRenderer.on('dreamcut:chat-event', receive);
      return () => ipcRenderer.removeListener('dreamcut:chat-event', receive);
    },
  }),
}));
