// Main-process update owner. No project paths, credentials or renderer IPC.
export function updateFeed(manifest, { packaged, platform, arch, version }) {
  if (!packaged || platform !== 'darwin' || manifest?.channel === 'local') return null;
  if (manifest?.schemaVersion !== 1 || manifest.platform !== platform || manifest.arch !== arch || manifest.version !== version || !['preview', 'stable'].includes(manifest.channel)) throw Error('Invalid release metadata.');
  const url = new URL(manifest.feedUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('Invalid update feed.');
  return url.href;
}

export function createUpdateController({ updater, feed, verifySignature, prepareToInstall, onInstallFailure = () => {}, onState = () => {} }) {
  let state = feed ? 'idle' : 'unavailable', disposed = false, configured = false;
  const publish = value => { state = value; if (!disposed) onState(value); };
  const listeners = {
    'update-available': () => { if (state === 'checking') publish('downloading'); },
    'update-not-available': () => { if (state === 'checking') publish('current'); },
    'update-downloaded': () => { if (['checking', 'downloading'].includes(state)) publish('ready'); },
    error: () => { if (!disposed && state !== 'installing') publish('failed'); },
  };
  for (const [name, handler] of Object.entries(listeners)) updater.on(name, handler);
  return {
    get state() { return state; },
    async check() {
      if (disposed || !feed) return state;
      if (!['idle', 'current', 'failed'].includes(state)) return state;
      publish('checking');
      try {
        await verifySignature();
        if (disposed) return state;
        if (!configured) { updater.setFeedURL({ url: feed, serverType: 'json' }); configured = true; }
        updater.checkForUpdates();
      } catch { publish('failed'); }
      return state;
    },
    async install() {
      if (disposed || state !== 'ready') return false;
      publish('installing');
      try {
        await prepareToInstall();
        if (disposed) return false;
        updater.quitAndInstall();
        return true;
      } catch { onInstallFailure(); publish('failed'); return false; }
    },
    dispose() { disposed = true; for (const [name, handler] of Object.entries(listeners)) updater.removeListener(name, handler); },
  };
}
